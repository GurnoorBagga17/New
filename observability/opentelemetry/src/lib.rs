// Copyright 2024 Axiom NHI — Licensed under Apache-2.0
//! Axiom NHI Phase 1 — trace-context propagation and measurement helpers.
//!
//! **Team:** Team 5 (Observability, Audit & Emergency Controls)
//! **Owner:** `@axiom-nhi/team-5-observability`
//! **Status:** Draft `0.1.0-draft` (Gate G1 first slice)
//!
//! This crate is deliberately transport-agnostic. It implements the W3C
//! `traceparent` rules that both the gateway (Team 1) and `ExtMCP` (Team 2)
//! need, plus the metric names and percentile helpers used to report the
//! Gate G1 latency and revocation-propagation measurements.
//!
//! # What this crate does
//! - Parse, validate, generate, and serialize W3C `traceparent` values.
//! - Sanitize `tracestate` and `baggage` before they cross a trust boundary.
//! - Define stable metric names/units so Team 6 can publish a reproducible
//!   measurement report.
//! - Provide a [`metrics::PropagationProbe`] that records update-to-visible
//!   delay without prescribing a storage or transport.
//!
//! # What this crate does not do
//! - It does not configure an OTLP exporter or collector. Exporter wiring is a
//!   deployment concern and is intentionally left behind a future integration
//!   step; the inline code path only needs the propagation contract.
//! - It does not log or propagate authorization headers. Baggage members whose
//!   keys look like credentials are dropped.
//!
//! # Security notes
//! - A missing or malformed `traceparent` is never a reason to block a request.
//!   Callers should generate a new root trace context and continue. Trace
//!   context is correlation data, not an authorization decision.
//! - Trace and span IDs are random values, not secrets. The OS RNG is preferred;
//!   a time/process/counter fallback keeps the function total if `getrandom`
//!   is unavailable.

pub mod metrics;
pub mod trace_context;

pub use metrics::{LatencySummary, PropagationProbe, PropagationSample};
pub use trace_context::{
    TraceContext, TraceError, TraceExtraction, TraceHeaders, TracePropagator, BAGGAGE_HEADER,
    MAX_BAGGAGE_LEN, MAX_TRACESTATE_LEN, TRACEPARENT_HEADER, TRACESTATE_HEADER,
};
