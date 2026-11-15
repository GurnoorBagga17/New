# Axiom NHI

Axiom NHI is building a Phase 1 runtime security gateway for MCP tools. The initial delivery is an open-core runtime wedge: observe-only onboarding, identity-aware policy checks, argument validation, local audit, and emergency revocation.

## Phase 1 teams

| Team | Owns | First working area |
| --- | --- | --- |
| 0 | Architecture, shared contracts, protocol | `docs/architecture/`, `docs/api-contracts/`, `docs/security/`, `proto/` |
| 1 | MCP gateway and packaging | `gateway/`, `deployments/docker/` |
| 2 | ExtMCP and policy engine | `services/extmcp/` |
| 3 | Identity and authentication | `identity/` |
| 4 | Argument and tool validators | `validators/` |
| 5 | Audit, telemetry, emergency controls | `observability/` |
| 6 | Integration, security, performance QA | `tests/` |

The playbooks in [`axiom_nhi_phase_1_team_implementation_playbooks.md`](axiom_nhi_phase_1_team_implementation_playbooks.md) define detailed scope and milestones. The bootstrap decisions and known interface gaps are tracked in [`docs/architecture/phase1-bootstrap.md`](docs/architecture/phase1-bootstrap.md).

## Contribution flow

1. Work only in your team's owned directories unless both Team 0 and the owning team approve an exception.
2. Use the shared contracts and record proposed interface changes before implementing consumers.
3. Keep Phase 1 changes within the runtime wedge. Phase 2 discovery and graph features, Phase 3 token exchange and approval workflows, and Phase 4 fleet governance are deferred.
4. Open a pull request with the affected team, contract/version impact, behavior changes, and evidence. See [the pull request template](.github/pull_request_template.md).

## Current Phase 1 status

The teams have produced prototypes and isolated component libraries, and Team 4's SQL, path, egress, and tool-pin validators now have a tested Rust implementation. The full Gate G1 runtime is not complete or deployment-ready: shared contracts remain draft, JWT/JWKS/CIMD verification is missing, the ExtMCP gRPC service and connected runtime are absent, and the Compose service endpoints are placeholders. The planned gateway UI and public landing page are also absent. See the [Phase 1 final engineering audit](docs/architecture/phase1-audit-report.md) for findings, verification results, and remaining gate criteria.

Run the Python mock suite with `python tests/run_tests.py` after installing `requirements-dev.txt`, and run all Rust crate tests with `cargo test --workspace`. These checks do not constitute live-stack Gate G1 evidence.
