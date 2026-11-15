# Team 4 — Validators

`axiom-validators` implements a profile-driven adapter for the Team 2
`ArgumentValidator` seam, with SQL AST analysis, filesystem root checks,
HTTPS host/DNS validation, and RFC 8785 tool-definition hashing. Profiles must
be supplied from trusted server-side configuration and selected by an exact
tool name. Unknown tools fail closed. Validators report facts; Cedar owns
authorization decisions.

Run the complete Rust suite with `cargo test --workspace`, or only Team 4 with
`cargo test -p axiom-validators`.

Security limits: filesystem validation does not replace sandboxed file opening
and has a time-of-check/time-of-use race unless the executor uses the same
confined root. Egress DNS checking does not pin the resolved address to the
eventual socket; production enforcement must connect to the validated address
or use an equivalent network sandbox. Tool definition hashing verifies the
configured definition held by the profile; deployments must refresh profiles
when the server's live tool registry changes.
