// Copyright 2024 Axiom NHI — Licensed under Apache-2.0
//! RFC 8707 Resource Indicators — Audience binding and confused deputy protection.
//!
//! RFC 8707: https://www.rfc-editor.org/info/rfc8707
//!
//! Resource indicators allow OAuth access tokens to be explicitly bound to a
//! target resource (MCP server in Axiom's case), preventing confused deputy attacks
//! where a token issued for one resource is replayed against another.
//!
//! **Attack Scenario Prevented:**
//! 1. Agent obtains token with `aud: ["mcp://analytics-server"]`
//! 2. Agent attempts to replay token against `mcp://prod-db-server`
//! 3. The exact-match validator rejects the audience mismatch; wiring it into
//!    the concrete verifier remains outstanding.
//!
//! **Implementation:**
//! - Compare JWT `aud` claim exactly against a configured canonical resource URI
//! - Support both single-string and array `aud` formats per RFC 7519
//! - Log target_server on mismatch but NOT the mismatched aud value (secret redaction)

pub mod validator;
