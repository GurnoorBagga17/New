# Mock SSE server specification for Team 7 / Team 6

**Status:** Development-only proposal; no backend endpoint is implemented here.

## Purpose and activation

Provide a local deterministic source for Module 1B while the real Team 1/5 SSE publisher is unavailable. The mock must be opt-in (for example `AXIOM_UI_USE_MOCK_SSE=1`), visibly labeled `MOCK DATA`, and disabled by default. When the real `/v1/local/events/stream` route is available, the UI switches to same-origin live mode and never silently falls back to synthetic traffic.

## Required behavior

- Serve `text/event-stream` from a local development-only route, not from production gateway-ui builds.
- Replay `events-stream.sse` for deterministic tests, then optionally generate clearly synthetic entries at a configurable rate of at least 500 events/sec for performance testing.
- Each generated event uses only the exact current `AuditEvent` fields and fake IDs from the shared fixture. Do not fabricate identity claims or validator fields that current Rust `AuditEvent` does not carry.
- Include deterministic event IDs, heartbeats, client disconnect handling, and a bounded producer queue. Report dropped mock events to the test harness rather than accumulating unbounded memory.
- Keep the UI ring buffer capped at 2,000 records; pause/resume affects rendering/consumption, not the server's unboundedly retained history.
- No outbound requests, third-party scripts, analytics, fonts, or secret-like fixture data.

## Acceptance tests for owning teams

1. With mock mode off, no mock stream is served or selected.
2. With mock mode on, the client labels every event as mock data and can replay both decision and kill-switch fixtures.
3. A 500 events/sec run checks rendered frame time and dropped-event count; it is a test measurement, not a Gate G1 pass claim.
4. Disconnect/reconnect does not duplicate data silently, exceed the 2,000-entry buffer, or expose credential canaries.
5. Team 6 owns the performance and zero-secret assertions; Team 7 owns the client implementation. Team 0 owns this fixture contract only.
