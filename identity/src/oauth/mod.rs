// Copyright 2024 Axiom NHI — Licensed under Apache-2.0
//! OAuth 2.1 bearer token validation and JWT verification.
//!
//! This module handles:
//! - Bearer token extraction from Authorization header (rejecting query-string tokens)
//! - JWT signature verification against cached JWKS
//! - Temporal validity checks (exp/nbf with bounded clock skew ≤30s)
//! - Claims extraction and validation
//!
//! **Security Notes:**
//! - Per OAuth 2.1 Section 5.2: tokens MUST be in Authorization header
//! - Bounded clock skew prevents excessive replay windows
//! - JWKS fetching is pinned to administrator-configured HTTPS URLs and checked public DNS results
//! - Raw bearer tokens never logged

pub mod jwks_cache;
pub mod jwt_validator;
