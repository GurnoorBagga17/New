#!/usr/bin/env python3
"""Validate shared draft OpenAPI and fixtures against committed JSON Schemas."""

import json
import sys
from pathlib import Path

try:
    import yaml
    from jsonschema import Draft202012Validator, FormatChecker
except ImportError as error:
    raise SystemExit(f"Install PyYAML and jsonschema to validate contracts: {error}") from error


ROOT = Path(__file__).resolve().parents[3]
CONTRACTS = ROOT / "docs/api-contracts"


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> int:
    schema_dir = CONTRACTS / "schemas"
    fixture_dir = CONTRACTS / "fixtures"
    schemas = {path.stem: read_json(path) for path in schema_dir.glob("*.schema.json")}
    for name, schema in schemas.items():
        Draft202012Validator.check_schema(schema)
        print(f"schema ok: {name}")

    cases = {
        "current-audit-event.schema": "events-stream.audit.json",
        "current-kill-switch-audit-event.schema": "events-stream.kill-switch.json",
        "current-revocation-state.schema": "current-revocation-state.json",
        "current-validation-report.schema": "policies-dry-run.response.json",
        "current-policy-version-info.schema": "policies-bundle.response.json",
        "draft-dry-run-request.schema": "policies-dry-run.request.json",
        "draft-policy-bundle-request.schema": "policies-bundle.request.json",
        "draft-revoke-request.schema": "sessions-revoke.request.json",
        "draft-revoke-response.schema": "sessions-revoke.response.json",
    }
    for schema_name, fixture_name in cases.items():
        Draft202012Validator(schemas[schema_name], format_checker=FormatChecker()).validate(
            read_json(fixture_dir / fixture_name)
        )
        print(f"fixture ok: {fixture_name}")

    stream = (fixture_dir / "events-stream.sse").read_text(encoding="utf-8")
    stream_count = 0
    for block in stream.strip().split("\n\n"):
        fields = dict(line.split(": ", 1) for line in block.splitlines() if ": " in line)
        event = json.loads(fields["data"])
        schema_name = (
            "current-kill-switch-audit-event.schema"
            if fields.get("event") == "kill_switch_action"
            else "current-audit-event.schema"
        )
        Draft202012Validator(schemas[schema_name], format_checker=FormatChecker()).validate(event)
        stream_count += 1
    if stream_count != 2:
        raise SystemExit("SSE fixture must include one decision and one kill-switch event")
    print("fixture ok: events-stream.sse (2 events)")

    openapi = yaml.safe_load((CONTRACTS / "local-admin-api.openapi.yaml").read_text(encoding="utf-8"))
    expected_paths = {
        "/events/stream": "get",
        "/policies/dry-run": "post",
        "/policies/bundle": "put",
        "/sessions/{id}/revoke": "post",
    }
    if openapi.get("openapi") != "3.1.0" or openapi.get("info", {}).get("version") != "0.1.0-draft":
        raise SystemExit("OpenAPI version/status mismatch")
    if set(openapi.get("paths", {})) != set(expected_paths):
        raise SystemExit("OpenAPI route set differs from the four reviewed proposals")
    for route, method in expected_paths.items():
        operation = openapi["paths"][route][method]
        if operation.get("x-axiom-implementation-status") != "proposal-not-implemented":
            raise SystemExit(f"{method.upper()} {route} must remain marked proposal-not-implemented")
    print("OpenAPI ok: all four routes are explicitly marked proposal-not-implemented")
    return 0


if __name__ == "__main__":
    sys.exit(main())
