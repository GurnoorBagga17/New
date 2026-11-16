# Axiom NHI Architectural & Security Rules

When modifying or generating code for Axiom NHI, adhere strictly to the following rules:

1. **Fail-Closed by Design:**
   - Any evaluation failure, timeout, unhandled exception, or unexpected input MUST reject the operation immediately.
   - Never implement fallback paths that default to permit.

2. **Licensing Isolation (Clean Apache-2.0 Boundaries):**
   - Axiom NHI is licensed under Apache-2.0.
   - OpenBao (MPL-2.0) must remain an unmodified binary running in its own container or process boundary, interacting only via external API / network protocols.
   - Do not import or link MPL-2.0 source code into Axiom Rust crates or packages.

3. **Cryptographic Integrity for Escalations & Approvals:**
   - Human-in-the-loop approvals must sign a SHA-256 or BLAKE3 cryptographic hash of the canonical serialized action payload.
   - Payloads must be re-verified against this hash before execution to eliminate Time-of-Check to Time-of-Use (TOCTOU) risks.

4. **Zero Raw Token Exposure:**
   - Secrets and ephemeral tokens must never appear in raw text in logs, audit traces, error messages, or unencrypted storage.
   - Use Secretless broker mechanisms where tokens are injected dynamically at egress or managed via vault dynamic engines.

5. **Deterministic OpenTelemetry Auditing:**
   - Every policy evaluation, identity delegation, and secret access must generate an OpenTelemetry trace span with complete identity attribution.
