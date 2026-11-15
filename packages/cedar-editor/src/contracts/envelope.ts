/**
 * JSON-RPC `tools/call` envelope parsing for the dry-run sample editor.
 *
 * This module validates *shape only*. It never parses SQL, filesystem paths, or
 * URLs to make a policy decision — those facts come from Team 4 via the backend
 * or `@axiom/cedar-wasm`.
 */

export interface ParsedToolCall {
  readonly method: "tools/call";
  readonly toolName: string;
  readonly arguments: Readonly<Record<string, unknown>>;
  readonly raw: Readonly<Record<string, unknown>>;
}

export type EnvelopeParseResult =
  | { readonly ok: true; readonly value: ParsedToolCall }
  | {
      readonly ok: false;
      readonly message: string;
      readonly line: number | null;
      readonly column: number | null;
    };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Convert a JSON.parse byte offset into a 1-based line/column pair. */
function offsetToLineColumn(
  text: string,
  offset: number,
): { line: number; column: number } {
  const before = text.slice(0, Math.max(0, offset));
  const lines = before.split("\n");
  return {
    line: lines.length,
    column: (lines[lines.length - 1]?.length ?? 0) + 1,
  };
}

/**
 * Parse the sample envelope text.
 *
 * Accepted shape:
 * ```json
 * {
 *   "jsonrpc": "2.0",
 *   "id": "req-0001",
 *   "method": "tools/call",
 *   "params": { "name": "execute_sql", "arguments": { ... } }
 * }
 * ```
 */
export function parseToolCallEnvelope(text: string): EnvelopeParseResult {
  if (text.trim().length === 0) {
    return {
      ok: false,
      message: "Envelope is empty.",
      line: null,
      column: null,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown JSON parse failure.";
    const match = /position\s+(\d+)/i.exec(message);
    const position = match?.[1] !== undefined ? Number(match[1]) : null;
    const location =
      position === null ? { line: null, column: null } : offsetToLineColumn(text, position);
    return {
      ok: false,
      message: `Invalid JSON: ${message}`,
      line: location.line,
      column: location.column,
    };
  }

  if (!isRecord(parsed)) {
    return {
      ok: false,
      message: "Envelope must be a JSON object.",
      line: null,
      column: null,
    };
  }

  if (parsed["method"] !== "tools/call") {
    return {
      ok: false,
      message: `Unsupported method ${JSON.stringify(parsed["method"])}. Only "tools/call" is evaluated by this studio.`,
      line: null,
      column: null,
    };
  }

  const params = parsed["params"];
  if (!isRecord(params)) {
    return {
      ok: false,
      message: "Envelope is missing an object at 'params'.",
      line: null,
      column: null,
    };
  }

  const toolName = params["name"];
  if (typeof toolName !== "string" || toolName.trim().length === 0) {
    return {
      ok: false,
      message: "Envelope is missing a non-empty string at 'params.name'.",
      line: null,
      column: null,
    };
  }

  const args = params["arguments"];
  if (!isRecord(args)) {
    return {
      ok: false,
      message: "Envelope is missing an object at 'params.arguments'.",
      line: null,
      column: null,
    };
  }

  return {
    ok: true,
    value: {
      method: "tools/call",
      toolName,
      arguments: args,
      raw: parsed,
    },
  };
}

/** A fake, zero-secret sample used by the studio and Storybook. */
export const SAMPLE_TOOLS_CALL_TEXT = `{
  "jsonrpc": "2.0",
  "id": "req-0001",
  "method": "tools/call",
  "params": {
    "name": "execute_sql",
    "arguments": {
      "query": "SELECT id, total FROM orders WHERE id = 42"
    }
  }
}
`;
