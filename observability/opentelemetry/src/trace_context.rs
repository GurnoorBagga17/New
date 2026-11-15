// Copyright 2024 Axiom NHI — Licensed under Apache-2.0
//! W3C Trace Context propagation.
//!
//! The shared `RuntimeRequest` contract carries `trace_id` as a W3C
//! `traceparent` identifier. This module is the single place where that format
//! is validated so the gateway and `ExtMCP` do not implement subtly different
//! parsers.
//!
//! Reference: <https://www.w3.org/TR/trace-context/>

use std::fmt;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

/// Header name for the W3C trace context parent.
pub const TRACEPARENT_HEADER: &str = "traceparent";
/// Header name for the optional vendor trace state.
pub const TRACESTATE_HEADER: &str = "tracestate";
/// Header name for optional baggage.
pub const BAGGAGE_HEADER: &str = "baggage";

/// Maximum accepted `tracestate` length (W3C recommends a small bound).
pub const MAX_TRACESTATE_LEN: usize = 512;
/// Maximum accepted baggage length. Baggage is not used for authorization.
pub const MAX_BAGGAGE_LEN: usize = 8 * 1024;

const TRACEPARENT_LEN: usize = 55;

/// A validated W3C trace context.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct TraceContext {
    /// 16-byte trace identifier. Must not be all zeroes.
    pub trace_id: [u8; 16],
    /// 8-byte span identifier. Must not be all zeroes.
    pub span_id: [u8; 8],
    /// Trace flags. Bit 0 is the sampled flag.
    pub trace_flags: u8,
}

impl TraceContext {
    /// Generate a new root trace context with a fresh trace and span ID.
    ///
    /// The sampled flag is set so a local development collector receives the
    /// trace by default. Production callers may clear it if sampling is decided
    /// elsewhere.
    pub fn new_root() -> Self {
        loop {
            let mut trace_id = [0u8; 16];
            let mut span_id = [0u8; 8];
            fill_random(&mut trace_id);
            fill_random(&mut span_id);
            if trace_id.iter().any(|b| *b != 0) && span_id.iter().any(|b| *b != 0) {
                return Self {
                    trace_id,
                    span_id,
                    trace_flags: 0x01,
                };
            }
        }
    }

    /// Create a child span in the same trace.
    pub fn child_span(&self) -> Self {
        loop {
            let mut span_id = [0u8; 8];
            fill_random(&mut span_id);
            if span_id.iter().any(|b| *b != 0) {
                return Self {
                    trace_id: self.trace_id,
                    span_id,
                    trace_flags: self.trace_flags,
                };
            }
        }
    }

    /// Whether the sampled bit is set.
    pub fn is_sampled(&self) -> bool {
        self.trace_flags & 0x01 != 0
    }

    /// Lowercase hex trace ID (32 characters).
    pub fn trace_id_hex(&self) -> String {
        hex_encode(&self.trace_id)
    }

    /// Lowercase hex span ID (16 characters).
    pub fn span_id_hex(&self) -> String {
        hex_encode(&self.span_id)
    }

    /// Serialize as a W3C `traceparent` header value.
    pub fn to_traceparent(&self) -> String {
        format!(
            "00-{}-{}-{:02x}",
            self.trace_id_hex(),
            self.span_id_hex(),
            self.trace_flags
        )
    }

    /// Parse and validate a W3C `traceparent` header value.
    ///
    /// Rules enforced:
    /// - version is two lowercase hex characters and is not `ff`;
    /// - version `00` is exactly 55 characters (four dash-separated fields);
    /// - trace ID is 32 lowercase hex characters and not all zeroes;
    /// - span ID is 16 lowercase hex characters and not all zeroes;
    /// - flags is two lowercase hex characters.
    ///
    /// Future versions are accepted only in the version-00 shape for Phase 1.
    /// This is stricter than the W3C forward-compatibility rule and is recorded
    /// as an interface decision rather than left implicit.
    pub fn parse_traceparent(value: &str) -> Result<Self, TraceError> {
        if value.is_empty() {
            return Err(TraceError::Missing);
        }
        if value.len() != TRACEPARENT_LEN {
            return Err(TraceError::Malformed("traceparent length must be 55"));
        }
        if value.bytes().any(|b| b.is_ascii_uppercase()) {
            return Err(TraceError::UppercaseHex);
        }

        let mut parts = value.split('-');
        let version = parts
            .next()
            .ok_or(TraceError::Malformed("missing version"))?;
        let trace_id = parts
            .next()
            .ok_or(TraceError::Malformed("missing trace id"))?;
        let span_id = parts
            .next()
            .ok_or(TraceError::Malformed("missing span id"))?;
        let flags = parts.next().ok_or(TraceError::Malformed("missing flags"))?;
        if parts.next().is_some() {
            return Err(TraceError::Malformed("unexpected extra field"));
        }

        let version = decode_hex_u8(version)?;
        if version == 0xff {
            return Err(TraceError::UnsupportedVersion(version));
        }

        let trace_id = decode_hex_array::<16>(trace_id)?;
        let span_id = decode_hex_array::<8>(span_id)?;
        let trace_flags = decode_hex_u8(flags)?;

        if trace_id.iter().all(|b| *b == 0) {
            return Err(TraceError::ZeroTraceId);
        }
        if span_id.iter().all(|b| *b == 0) {
            return Err(TraceError::ZeroSpanId);
        }

        Ok(Self {
            trace_id,
            span_id,
            trace_flags,
        })
    }
}

impl fmt::Display for TraceContext {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.to_traceparent())
    }
}

/// Errors produced while parsing trace context.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TraceError {
    /// No `traceparent` value was supplied.
    Missing,
    /// The value does not have the required shape.
    Malformed(&'static str),
    /// The version is `ff` (forbidden) or otherwise unsupported.
    UnsupportedVersion(u8),
    /// The trace ID is all zeroes.
    ZeroTraceId,
    /// The span ID is all zeroes.
    ZeroSpanId,
    /// W3C requires lowercase hex; uppercase input is rejected.
    UppercaseHex,
}

impl fmt::Display for TraceError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Missing => f.write_str("traceparent is missing"),
            Self::Malformed(reason) => write!(f, "traceparent is malformed: {reason}"),
            Self::UnsupportedVersion(v) => write!(f, "traceparent version {v:#04x} is unsupported"),
            Self::ZeroTraceId => f.write_str("traceparent trace id must not be all zeroes"),
            Self::ZeroSpanId => f.write_str("traceparent span id must not be all zeroes"),
            Self::UppercaseHex => f.write_str("traceparent must use lowercase hexadecimal"),
        }
    }
}

impl std::error::Error for TraceError {}

/// Headers relevant to trace propagation.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct TraceHeaders {
    /// `traceparent` header value, if present.
    pub traceparent: Option<String>,
    /// `tracestate` header value, if present.
    pub tracestate: Option<String>,
    /// `baggage` header value, if present.
    pub baggage: Option<String>,
}

/// Result of extracting trace context from headers.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TraceExtraction {
    /// A valid trace context was extracted.
    Extracted(TraceContext),
    /// No `traceparent` header was present.
    Missing,
    /// A `traceparent` header was present but invalid.
    Invalid(TraceError),
}

/// Stateless propagation helpers.
pub struct TracePropagator;

impl TracePropagator {
    /// Extract a trace context from headers without generating a replacement.
    pub fn extract(headers: &TraceHeaders) -> TraceExtraction {
        match headers.traceparent.as_deref() {
            None => TraceExtraction::Missing,
            Some(value) => match TraceContext::parse_traceparent(value) {
                Ok(context) => TraceExtraction::Extracted(context),
                Err(error) => TraceExtraction::Invalid(error),
            },
        }
    }

    /// Extract a trace context, generating a root context when absent or invalid.
    ///
    /// Invalid input is reported to the caller so it can increment the
    /// `axiom.trace.parse.failures` metric, but it is not a request failure.
    pub fn extract_or_root(headers: &TraceHeaders) -> (TraceContext, TraceExtraction) {
        match Self::extract(headers) {
            TraceExtraction::Extracted(context) => (context, TraceExtraction::Extracted(context)),
            other => (TraceContext::new_root(), other),
        }
    }

    /// Produce headers for an outgoing request.
    ///
    /// Only trace context is injected. Authorization headers are never copied.
    pub fn inject(context: &TraceContext) -> TraceHeaders {
        TraceHeaders {
            traceparent: Some(context.to_traceparent()),
            tracestate: None,
            baggage: None,
        }
    }

    /// Sanitize a `tracestate` value before forwarding it.
    ///
    /// Control characters are removed and the value is bounded. An empty result
    /// becomes `None`.
    pub fn sanitize_tracestate(value: &str) -> Option<String> {
        sanitize_header_value(value, MAX_TRACESTATE_LEN)
    }

    /// Sanitize a `baggage` value before forwarding it.
    ///
    /// In addition to control-character stripping and length bounding, members
    /// whose keys look like credentials are removed. Baggage must never become a
    /// side channel for bearer tokens or secrets.
    pub fn sanitize_baggage(value: &str) -> Option<String> {
        let cleaned: String = value
            .chars()
            .filter(|c| !c.is_control())
            .take(MAX_BAGGAGE_LEN)
            .collect();

        let mut kept: Vec<&str> = Vec::new();
        for member in cleaned.split(',') {
            let member = member.trim();
            if member.is_empty() {
                continue;
            }
            let key = member
                .split_once('=')
                .map(|(key, _)| key.trim())
                .unwrap_or(member)
                .to_ascii_lowercase();
            if looks_sensitive(&key) {
                continue;
            }
            kept.push(member);
        }

        if kept.is_empty() {
            None
        } else {
            Some(kept.join(","))
        }
    }
}

fn sanitize_header_value(value: &str, max_len: usize) -> Option<String> {
    let cleaned: String = value
        .chars()
        .filter(|c| !c.is_control())
        .take(max_len)
        .collect();
    let trimmed = cleaned.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn looks_sensitive(key: &str) -> bool {
    const SENSITIVE_FRAGMENTS: &[&str] = &[
        "auth",
        "token",
        "secret",
        "password",
        "passwd",
        "api_key",
        "apikey",
        "credential",
        "cookie",
        "session",
        "private_key",
        "privatekey",
    ];
    SENSITIVE_FRAGMENTS
        .iter()
        .any(|fragment| key.contains(fragment))
}

fn decode_hex_u8(value: &str) -> Result<u8, TraceError> {
    let bytes = decode_hex_array::<1>(value)?;
    Ok(bytes[0])
}

fn decode_hex_array<const N: usize>(value: &str) -> Result<[u8; N], TraceError> {
    if value.len() != N * 2 {
        return Err(TraceError::Malformed("hex field has the wrong length"));
    }
    let mut out = [0u8; N];
    let raw = value.as_bytes();
    for (i, slot) in out.iter_mut().enumerate() {
        let hi = hex_nibble(raw[i * 2])?;
        let lo = hex_nibble(raw[i * 2 + 1])?;
        *slot = (hi << 4) | lo;
    }
    Ok(out)
}

fn hex_nibble(byte: u8) -> Result<u8, TraceError> {
    match byte {
        b'0'..=b'9' => Ok(byte - b'0'),
        b'a'..=b'f' => Ok(byte - b'a' + 10),
        b'A'..=b'F' => Err(TraceError::UppercaseHex),
        _ => Err(TraceError::Malformed("invalid hexadecimal digit")),
    }
}

fn hex_encode(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        out.push(HEX[(byte >> 4) as usize] as char);
        out.push(HEX[(byte & 0x0f) as usize] as char);
    }
    out
}

fn fill_random(buffer: &mut [u8]) {
    if getrandom::getrandom(buffer).is_ok() {
        return;
    }

    // Trace IDs are correlation values, not secrets. If the OS RNG is
    // unavailable, a time/process/counter mix keeps trace IDs unique enough for
    // local correlation instead of panicking on the request path.
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos() as u64)
        .unwrap_or(0);
    let mut state = nanos
        ^ (std::process::id() as u64).rotate_left(32)
        ^ COUNTER.fetch_add(1, Ordering::Relaxed);
    for slot in buffer.iter_mut() {
        // SplitMix64 step.
        state = state.wrapping_add(0x9e37_79b9_7f4a_7c15);
        let mut z = state;
        z = (z ^ (z >> 30)).wrapping_mul(0xbf58_476d_1ce4_e5b9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94d0_49bb_1331_11eb);
        z ^= z >> 31;
        *slot = z as u8;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const VALID: &str = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";

    #[test]
    fn parses_valid_traceparent() {
        let context = TraceContext::parse_traceparent(VALID).expect("valid traceparent");
        assert_eq!(context.trace_id_hex(), "4bf92f3577b34da6a3ce929d0e0e4736");
        assert_eq!(context.span_id_hex(), "00f067aa0ba902b7");
        assert!(context.is_sampled());
        assert_eq!(context.to_traceparent(), VALID);
    }

    #[test]
    fn rejects_missing_and_short_values() {
        assert_eq!(
            TraceContext::parse_traceparent("").unwrap_err(),
            TraceError::Missing
        );
        assert!(matches!(
            TraceContext::parse_traceparent("00-abc").unwrap_err(),
            TraceError::Malformed(_)
        ));
    }

    #[test]
    fn rejects_uppercase_hex() {
        let value = "00-4BF92F3577B34DA6A3CE929D0E0E4736-00f067aa0ba902b7-01";
        assert_eq!(
            TraceContext::parse_traceparent(value).unwrap_err(),
            TraceError::UppercaseHex
        );
    }

    #[test]
    fn rejects_zero_ids_and_ff_version() {
        let zero_trace = "00-00000000000000000000000000000000-00f067aa0ba902b7-01";
        let zero_span = "00-4bf92f3577b34da6a3ce929d0e0e4736-0000000000000000-01";
        let bad_version = "ff-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";
        assert_eq!(
            TraceContext::parse_traceparent(zero_trace).unwrap_err(),
            TraceError::ZeroTraceId
        );
        assert_eq!(
            TraceContext::parse_traceparent(zero_span).unwrap_err(),
            TraceError::ZeroSpanId
        );
        assert_eq!(
            TraceContext::parse_traceparent(bad_version).unwrap_err(),
            TraceError::UnsupportedVersion(0xff)
        );
    }

    #[test]
    fn child_span_keeps_trace_and_changes_span() {
        let parent = TraceContext::parse_traceparent(VALID).unwrap();
        let child = parent.child_span();
        assert_eq!(child.trace_id, parent.trace_id);
        assert_ne!(child.span_id, parent.span_id);
        assert_eq!(child.trace_flags, parent.trace_flags);
        assert!(child.span_id.iter().any(|b| *b != 0));
    }

    #[test]
    fn root_context_roundtrips() {
        let root = TraceContext::new_root();
        let parsed = TraceContext::parse_traceparent(&root.to_traceparent()).unwrap();
        assert_eq!(root, parsed);
        assert!(root.trace_id.iter().any(|b| *b != 0));
        assert!(root.span_id.iter().any(|b| *b != 0));
    }

    #[test]
    fn extraction_distinguishes_missing_invalid_and_valid() {
        let missing = TraceHeaders::default();
        assert_eq!(TracePropagator::extract(&missing), TraceExtraction::Missing);

        let invalid = TraceHeaders {
            traceparent: Some("nope".into()),
            ..Default::default()
        };
        assert!(matches!(
            TracePropagator::extract(&invalid),
            TraceExtraction::Invalid(_)
        ));

        let valid = TraceHeaders {
            traceparent: Some(VALID.into()),
            ..Default::default()
        };
        assert!(matches!(
            TracePropagator::extract(&valid),
            TraceExtraction::Extracted(_)
        ));
    }

    #[test]
    fn extract_or_root_generates_on_invalid_input() {
        let invalid = TraceHeaders {
            traceparent: Some("nope".into()),
            ..Default::default()
        };
        let (context, outcome) = TracePropagator::extract_or_root(&invalid);
        assert!(matches!(outcome, TraceExtraction::Invalid(_)));
        assert!(context.trace_id.iter().any(|b| *b != 0));
    }

    #[test]
    fn baggage_drops_credential_like_members() {
        let baggage = "tenant=acme,authorization=Bearer%20abc,token=abc,session_id=xyz,region=eu";
        let sanitized = TracePropagator::sanitize_baggage(baggage).unwrap();
        assert_eq!(sanitized, "tenant=acme,region=eu");
        assert!(!sanitized.contains("Bearer"));
        assert!(!sanitized.contains("session_id"));
    }

    #[test]
    fn baggage_is_bounded_and_control_characters_removed() {
        let value = format!("tenant=acme{}", "x".repeat(MAX_BAGGAGE_LEN * 2));
        let sanitized = TracePropagator::sanitize_baggage(&value).unwrap();
        assert!(sanitized.len() <= MAX_BAGGAGE_LEN);
        assert!(!sanitized.chars().any(|c| c.is_control()));
    }

    #[test]
    fn tracestate_is_bounded() {
        let value = "x".repeat(MAX_TRACESTATE_LEN * 2);
        let sanitized = TracePropagator::sanitize_tracestate(&value).unwrap();
        assert_eq!(sanitized.len(), MAX_TRACESTATE_LEN);
    }
}
