"""
Integration tests verifying every P0, P1, and P2 remediation item from the
Axiom NHI Production Readiness & Competitive Gap Analysis.
"""
import json
import os
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def _request(port: int, method: str, path: str, body: dict | None = None, headers: dict | None = None):
    req_headers = {"Accept": "application/json"}
    if body is not None:
        req_headers["Content-Type"] = "application/json"
    if headers:
        req_headers.update(headers)
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(f"http://127.0.0.1:{port}{path}", data=data, headers=req_headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=2.5) as resp:
            return resp.status, dict(resp.headers), json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as err:
        return err.code, dict(err.headers), json.loads(err.read().decode("utf-8"))


def test_cors_rate_limiting_validation_rbac_and_competitive_apis():
    port = 18092
    env = dict(os.environ)
    env["PORT"] = str(port)
    env["AXIOM_ALLOWED_ORIGINS"] = "http://localhost:8080"
    env["AXIOM_RATE_LIMIT_RPM"] = "25"
    env["AXIOM_REQUIRE_RBAC"] = "true"
    proc = subprocess.Popen(
        ["node", str(ROOT / "gateway/local-admin-api/server.cjs")],
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    try:
        for _ in range(30):
            try:
                status, _, _ = _request(port, "GET", "/healthz")
                if status == 200:
                    break
            except Exception:
                time.sleep(0.05)

        # 1. Explicit CORS policy: reject unauthorized origin, allow configured origin
        status, _, body = _request(
            port, "GET", "/healthz", headers={"Origin": "https://malicious.example.com"}
        )
        assert status == 403
        assert body["error"] == "CORS_ORIGIN_DENIED"

        status, hdrs, _ = _request(
            port, "GET", "/healthz", headers={"Origin": "http://localhost:8080"}
        )
        assert status == 200
        assert hdrs.get("Access-Control-Allow-Origin") == "http://localhost:8080"

        # 2. RBAC enforcement: auditor cannot activate policy bundle or execute revoke
        status, _, body = _request(
            port,
            "PUT",
            "/v1/local/policies/bundle",
            body={"policies": [{"id": "p1", "source": "permit(principal, action, resource);"}], "schema": "namespace Axiom {}"},
            headers={"X-Axiom-Role": "auditor"},
        )
        assert status == 403
        assert "RBAC_FORBIDDEN" in body["errors"][0]

        # 3. Centralized Input Validation: reject raw secret in dry-run request
        status, _, body = _request(
            port,
            "POST",
            "/v1/local/policies/dry-run",
            body={
                "policies": [{"id": "p1", "source": "permit(principal, action, resource);"}],
                "schema": "namespace Axiom {}",
                "envelope": {
                    "target_server": "prod-db",
                    "tool_name": "execute_sql",
                    "raw_arguments": {"token": "AKIAIOSFODNN7EXAMPLE"},
                },
            },
            headers={"X-Axiom-Role": "security-admin"},
        )
        assert status == 400
        assert any("ZERO-SECRET GUARD" in e for e in body["validation_errors"])

        # 4. P2 Killer Feature: Air-Gapped Attested Secretless Lease Broker
        status, _, lease = _request(
            port,
            "POST",
            "/v1/secretless/attest-and-lease",
            body={
                "spiffe_id": "spiffe://axiom.internal/ns/prod/sa/finance-agent",
                "workload_sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
                "target_vault_path": "vault://openbao/prod-db/readonly",
                "requested_ttl_seconds": 180,
            },
            headers={"X-Axiom-Role": "workload-attester"},
        )
        assert status == 200
        assert lease["attested_airgap"] is True
        assert "Attested SPIFFE" in lease["zero_secret_pill"]

        # 5. P2 Automated Anomaly Remediation Playbook execution
        status, _, pbk = _request(
            port,
            "POST",
            "/v1/playbooks/execute",
            body={
                "playbook_id": "auto-rotate-compromised-secret",
                "entity_id": "agent:shadow-sync-bot",
            },
            headers={"X-Axiom-Role": "operator"},
        )
        assert status == 200
        assert pbk["status"] == "EXECUTED"

        # 6. Rate limiting: exceed 25 requests in window and verify 429 + Retry-After
        hit_429 = False
        for _ in range(30):
            st, h, _ = _request(port, "GET", "/healthz")
            if st == 429:
                hit_429 = True
                assert "Retry-After" in h or "retry-after" in {k.lower() for k in h}
                break
        assert hit_429, "Rate limiter must return HTTP 429 when window limit is exceeded"
    finally:
        proc.terminate()
        proc.wait(timeout=5)
