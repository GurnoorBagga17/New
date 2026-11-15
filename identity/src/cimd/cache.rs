// Copyright 2024 Axiom NHI — Licensed under Apache-2.0
//! CIMD document caching layer.
//!
//! Similar caching strategy to JWKS:
//! - TTL-based eviction (recommend 1 hour)
//! - SSRF protection on all fetches
//! - Non-blocking failure behavior (CIMD is optional metadata)

// Placeholder for concrete implementation
// TODO: Implement CimdCache with moka + reqwest
