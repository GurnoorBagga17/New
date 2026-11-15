# Security architecture handoff

Team 0 owns the Phase 1 security architecture; Team 6 co-owns its assurance review. Initial security boundaries are:

- Raw bearer credentials are passed only to the identity verifier and are never written to logs, audit events, fixtures, or error messages.
- Validator results contain normalized facts, not authorization policy decisions.
- Cedar policy evaluation consumes structured context; it does not parse raw SQL or paths.
- Enforce mode fails closed when a required security decision is unavailable.
- Audit emission is redacted and asynchronous, and cannot block request evaluation.
- Egress decisions must be enforced at the network connection boundary to resist DNS rebinding.
- Revocation blocks new protected calls; Phase 1 does not cancel an already-running upstream tool call.

Threat cases and acceptance expectations are in the Team 4 and Team 6 sections of the source playbook. Team 6 should review concrete tests against this boundary before the first integration gate.
