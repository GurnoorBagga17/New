import { describe, expect, it } from "vitest";
import { parseToolCallEnvelope, SAMPLE_TOOLS_CALL_TEXT } from "./contracts/envelope.js";
import { resolveRouteMode, resolveVerdict } from "./adapters/result.js";

describe("Cedar editor boundary helpers", () => {
  it("parses the shared tools/call sample without interpreting its arguments", () => {
    const result = parseToolCallEnvelope(SAMPLE_TOOLS_CALL_TEXT);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.method).toBe("tools/call");
      expect(result.value.toolName).toBe("execute_sql");
      expect(result.value.arguments).toEqual({
        query: "SELECT id, total FROM orders WHERE id = 42",
      });
    }
  });

  it("rejects a non tools/call envelope", () => {
    const result = parseToolCallEnvelope('{"method":"tools/list","params":{}}');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("Only \"tools/call\"");
  });

  it("presents a denied shadow result as WOULD_DENY in observe mode", () => {
    expect(resolveVerdict("DENY", null, "observe")).toEqual({
      verdict: "WOULD_DENY",
      source: "derived",
    });
  });

  it("uses explicit route mode before a route default", () => {
    expect(
      resolveRouteMode("observe", "mcp://demo/analytics", [
        { routeId: "mcp://demo/analytics", mode: "enforce" },
      ]),
    ).toBe("observe");
  });
});
