// Copyright 2024 Axiom NHI — Licensed under Apache-2.0
//! Client ID Metadata Document (CIMD) fetching and validation.
//!
//! Per MCP Client Registration spec:
//! https://blog.modelcontextprotocol.io/posts/client_registration/
//!
//! URL-formatted `client_id` values (e.g., `https://app.example.com/client-metadata`)
//! point to a JSON metadata document describing the client application.
//!
//! This enables MCP agents to self-describe without manual OAuth dynamic client
//! registration sprawl.
//!
//! **Phase 1 Scope:**
//! - Fetch and cache CIMD documents
//! - Validate HTTPS URLs and TLS certificates
//! - Apply SSRF protections (same rules as JWKS)
//! - CIMD unavailability is non-blocking (optional metadata enrichment)
//!
//! **DRAFT DEPENDENCY:**
//! The `IdentityContext.cimd_uri` field is marked `Option<String>` because
//! not all OAuth providers use CIMD (traditional static registrations exist).
//! Team 0 must confirm optionality before contract freeze.

pub(crate) mod cache;

// Placeholder for concrete implementation
// TODO: Implement CimdFetcher with caching and SSRF protection
