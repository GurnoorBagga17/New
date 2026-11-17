// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
import { NextResponse } from "next/server";
import { ADMIN_API_URL, getAdminHeaders } from "../proxy";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const upstream = await fetch(`${ADMIN_API_URL}/v1/lineage/simulate-revoke`, {
      method: "POST",
      headers: getAdminHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(1500),
    });

    if (upstream.ok) {
      const data = await upstream.json();
      return NextResponse.json(data);
    }
  } catch {
    // Upstream offline fallback
  }

  return NextResponse.json({
    target_uid: "agent::reporting-worker-4",
    safe_to_revoke_immediately: false,
    directly_affected_agents: ["agent::reporting-worker-4"],
    transitively_affected_workloads: [],
    shared_credential_siblings: ["agent::payroll-bot-1"],
    severed_siblings: ["agent::payroll-bot-1"],
    blast_radius_score: 65,
    recommended_action: "Shared credential impact detected across 1 sibling workload. Issue scoped RFC 8693 session revocation before revoking underlying secret.",
    calculated_by: "axiom-console-edge-fallback",
  });
}
