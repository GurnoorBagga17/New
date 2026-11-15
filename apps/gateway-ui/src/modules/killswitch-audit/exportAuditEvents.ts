import type { AuditEvent } from "../traffic/types";
import { containsSecret } from "../traffic/utils/secretScrubber";

export type AuditExportFormat = "csv" | "ndjson";

const EXPORT_FIELDS = [
  "timestamp_rfc3339",
  "request_id",
  "trace_id",
  "agent_id",
  "target_server",
  "tool_name",
  "runtime_mode",
  "decision",
  "policy_version",
  "denial_reason",
  "validator_summary",
  "kill_switch_active",
  "latency_us",
] as const satisfies readonly (keyof AuditEvent)[];

export class SecretDetectedInExportError extends Error {
  constructor() {
    super("Audit export blocked because secret-like content was detected.");
    this.name = "SecretDetectedInExportError";
  }
}

function assertRedacted(events: readonly AuditEvent[]): void {
  for (const event of events) {
    if (containsSecret(JSON.stringify(event)).found) {
      throw new SecretDetectedInExportError();
    }
  }
}

function csvCell(value: unknown): string {
  let text = Array.isArray(value) ? value.join("; ") : String(value ?? "");
  // Excel and spreadsheet clients may execute cells beginning with formula operators.
  if (/^[\s\u0000-\u001f]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function buildAuditExport(
  events: readonly AuditEvent[],
  format: AuditExportFormat,
): string {
  assertRedacted(events);

  if (format === "ndjson") {
    return events.map((event) => JSON.stringify(event)).join("\n");
  }

  const header = EXPORT_FIELDS.map(csvCell).join(",");
  const rows = events.map((event) =>
    EXPORT_FIELDS.map((field) => csvCell(event[field])).join(","),
  );
  return [header, ...rows].join("\r\n");
}
