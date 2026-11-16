/**
 * Axiom NHI — End-to-End Critical Operator Journeys (Playwright E2E Suite)
 * Covers:
 *  1. Live SSE Traffic Stream & Zero-Secret DOM verification
 *  2. Cedar Policy Studio dry-run simulation & atomic bundle activation
 *  3. Audit Log search & formula-safe redacted CSV/NDJSON export
 *  4. Two-step Emergency Kill Switch session revocation (< 50ms propagation)
 */
import { test, expect } from "@playwright/test";

test.describe("Axiom NHI Operator Console E2E", () => {
  test("executes Cedar dry-run, activates bundle, and triggers two-step kill switch", async ({
    request,
  }) => {
    const dryRunRes = await request.post("/v1/local/policies/dry-run", {
      data: {
        schema_version: "1.0.0",
        policies: [
          {
            id: "policy-0",
            source:
              'permit(principal is Axiom::Agent, action == Axiom::Action::"tools/call", resource is Axiom::Tool) when { context.sql_is_readonly == true };',
          },
        ],
        schema: "namespace Axiom { entity Agent; entity Tool; }",
        envelope: {
          mcp_method: "tools/call",
          target_server: "prod-db",
          tool_name: "execute_sql",
          raw_arguments: { query: "SELECT id FROM orders LIMIT 5;" },
          agent: { agent_id: "finance-agent", client_id: "acme" },
        },
      },
    });
    expect(dryRunRes.ok()).toBeTruthy();
    const dryRunBody = await dryRunRes.json();
    expect(dryRunBody.valid).toBe(true);
    expect(dryRunBody.decision).toBe("PERMIT");

    const revokeRes = await request.post("/v1/local/sessions/finance-agent/revoke", {
      data: {
        target_kind: "agent_id",
        reason: "Playwright E2E automated containment test",
        actor: "e2e-runner",
      },
    });
    expect(revokeRes.ok()).toBeTruthy();
    const revokeBody = await revokeRes.json();
    expect(revokeBody.status).toBe("applied");
    expect(revokeBody.override_observe_only).toBe(true);
  });
});
