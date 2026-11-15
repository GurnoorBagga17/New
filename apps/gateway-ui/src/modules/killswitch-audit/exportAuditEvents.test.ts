import { describe, expect, it } from "vitest";
import type { AuditEvent } from "../traffic/types";
import { buildAuditExport, SecretDetectedInExportError } from "./exportAuditEvents";

const event: AuditEvent = {
  timestamp_rfc3339: "2026-11-15T10:00:00.000Z",
  request_id: "req-demo-0001",
  trace_id: "trace-demo-0001",
  agent_id: "agent-demo-001",
  target_server: "mcp://demo/analytics",
  tool_name: "execute_sql",
  runtime_mode: "observe-only",
  decision: "WOULD_DENY",
  policy_version: "sha256:demo-only",
  denial_reason: null,
  validator_summary: ["sql: read-only"],
  kill_switch_active: false,
  latency_us: 1250,
};

describe("audit export", () => {
  it("writes selected current DTO fields to CSV with escaped strings", () => {
    const output = buildAuditExport([{ ...event, agent_id: 'agent, "demo"' }], "csv");
    expect(output).toContain('"agent, ""demo"""');
    expect(output).toContain('"WOULD_DENY"');
  });

  it("prefixes spreadsheet formula cells with an apostrophe", () => {
    const output = buildAuditExport([{ ...event, agent_id: "  =1+1" }], "csv");
    expect(output).toContain('"\'  =1+1"');
  });

  it("emits one JSON object per line for NDJSON", () => {
    const output = buildAuditExport([event, { ...event, request_id: "req-demo-0002" }], "ndjson");
    expect(output.split("\n")).toHaveLength(2);
    expect(JSON.parse(output.split("\n")[0] ?? "{}")).toMatchObject({ request_id: event.request_id });
  });

  it("blocks an export that contains a shared secret pattern", () => {
    expect(() => buildAuditExport([{ ...event, denial_reason: "Authorization: Bearer fake-test-value" }], "ndjson"))
      .toThrow(SecretDetectedInExportError);
  });
});
