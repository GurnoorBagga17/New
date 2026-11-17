// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
import { NextRequest, NextResponse } from "next/server";
import { ADMIN_API_URL, getAdminHeaders } from "../proxy";
import { getOperatorSession } from "../../auth/store";

export async function POST(req: NextRequest) {
  const session = await getOperatorSession(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const upstream = await fetch(`${ADMIN_API_URL}/v1/lineage/simulate-revoke`, {
      method: "POST",
      headers: getAdminHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(3000),
    });

    if (upstream.ok) {
      const data = await upstream.json();
      return NextResponse.json(data);
    }

    const errJson = await upstream.json().catch(() => ({}));
    return NextResponse.json(
      { error: "Upstream blast radius simulation failed", details: errJson },
      { status: upstream.status }
    );
  } catch (err: unknown) {
    return NextResponse.json(
      { error: "Upstream control plane unreachable; could not simulate blast radius", details: String(err) },
      { status: 502 }
    );
  }
}
