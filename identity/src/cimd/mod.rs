// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
//! Client ID Metadata Document (CIMD) verification, SSRF guard, and caching.
//!
//! Per the MCP OAuth 2.1 Authorization specification, URL-formatted `client_id`
//! claims (e.g. `https://agents.corp.example/mcp/finance-agent.json`) resolve
//! to a self-describing JSON metadata document containing client name, URI,
//! contacts, grant types, and expected JWK/JWKS bindings.

pub mod cache;

use std::net::IpAddr;
use std::sync::Arc;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use thiserror::Error;
use url::Url;

pub use cache::CimdCache;

/// Validated Client ID Metadata Document (CIMD).
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct CimdDocument {
    pub client_id: String,
    pub client_name: String,
    #[serde(default)]
    pub client_uri: Option<String>,
    #[serde(default)]
    pub logo_uri: Option<String>,
    #[serde(default)]
    pub contacts: Vec<String>,
    #[serde(default)]
    pub grant_types: Vec<String>,
    #[serde(default)]
    pub token_endpoint_auth_method: Option<String>,
    #[serde(default)]
    pub jwks_uri: Option<String>,
    #[serde(default)]
    pub software_id: Option<String>,
    #[serde(default)]
    pub software_version: Option<String>,
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum CimdError {
    #[error("invalid CIMD URL '{0}': must be a valid HTTPS URI")]
    InvalidUrl(String),
    #[error("SSRF blocked: CIMD host '{0}' resolves to private, loopback, or metadata IP")]
    SsrfBlocked(String),
    #[error("CIMD client_id mismatch: expected '{expected}', got '{actual}'")]
    ClientIdMismatch { expected: String, actual: String },
    #[error("CIMD document parse error: {0}")]
    ParseError(String),
}

/// Validates whether a `client_id` string is a CIMD HTTPS URI and applies
/// strict SSRF protections (rejecting loopback, RFC 1918 private networks,
/// link-local cloud metadata `169.254.169.254`, and IPv6 ULA/loopback).
pub struct CimdValidator {
    cache: Arc<CimdCache>,
}

impl CimdValidator {
    pub fn new(ttl: Duration, max_entries: usize) -> Self {
        Self {
            cache: Arc::new(CimdCache::new(ttl, max_entries)),
        }
    }

    pub fn is_cimd_client_id(client_id: &str) -> bool {
        client_id.starts_with("https://")
    }

    /// Validates URL structure and SSRF rules before any network or cache lookup.
    pub fn validate_cimd_url(raw_url: &str) -> Result<Url, CimdError> {
        let parsed = Url::parse(raw_url).map_err(|_| CimdError::InvalidUrl(raw_url.to_owned()))?;
        if parsed.scheme() != "https" {
            return Err(CimdError::InvalidUrl(raw_url.to_owned()));
        }
        if !parsed.username().is_empty() || parsed.password().is_some() || parsed.fragment().is_some() {
            return Err(CimdError::InvalidUrl(raw_url.to_owned()));
        }
        let host = parsed
            .host_str()
            .ok_or_else(|| CimdError::InvalidUrl(raw_url.to_owned()))?;

        if host.eq_ignore_ascii_case("localhost")
            || host.ends_with(".localhost")
            || host.ends_with(".internal")
            || host == "metadata.google.internal"
        {
            return Err(CimdError::SsrfBlocked(host.to_owned()));
        }

        // Check IP literal hosts against private/loopback/link-local ranges
        let clean_host = host.trim_start_matches('[').trim_end_matches(']');
        if let Ok(ip) = clean_host.parse::<IpAddr>() {
            if is_non_global_ip(&ip) {
                return Err(CimdError::SsrfBlocked(host.to_owned()));
            }
        }

        Ok(parsed)
    }

    /// Validates and caches a fetched CIMD JSON payload against the expected `client_id`.
    pub fn validate_and_cache_json(
        &self,
        expected_client_id: &str,
        raw_json: &str,
    ) -> Result<CimdDocument, CimdError> {
        let _ = Self::validate_cimd_url(expected_client_id)?;
        let doc: CimdDocument =
            serde_json::from_str(raw_json).map_err(|e| CimdError::ParseError(e.to_string()))?;
        if doc.client_id != expected_client_id {
            return Err(CimdError::ClientIdMismatch {
                expected: expected_client_id.to_owned(),
                actual: doc.client_id,
            });
        }
        self.cache.insert(expected_client_id.to_owned(), doc.clone());
        Ok(doc)
    }

    pub fn resolve_cached(&self, client_id: &str) -> Result<Option<CimdDocument>, CimdError> {
        let _ = Self::validate_cimd_url(client_id)?;
        Ok(self.cache.get(client_id))
    }
}

fn is_non_global_ip(ip: &IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            v4.is_loopback()
                || v4.is_private()
                || v4.is_link_local()
                || v4.is_broadcast()
                || v4.is_unspecified()
                || v4.octets()[0] == 100 && (v4.octets()[1] & 0b1100_0000) == 0b0100_0000 // CGNAT 100.64.0.0/10
        }
        IpAddr::V6(v6) => {
            v6.is_loopback()
                || v6.is_unspecified()
                || (v6.segments()[0] & 0xfe00) == 0xfc00 // Unique Local (fc00::/7)
                || (v6.segments()[0] & 0xffc0) == 0xfe80 // Link-local (fe80::/10)
        }
    }
}
