// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
import { NextRequest, NextResponse } from "next/server";
import { ADMIN_API_URL, getAdminHeaders } from "../proxy";
import { getOperatorSession } from "../../auth/store";

export async function GET(req: NextRequest) {
  const session = await getOperatorSession(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const upstream = await fetch(`${ADMIN_API_URL}/v1/owasp/scorecard`, {
      method: "GET",
      headers: getAdminHeaders(),
      signal: AbortSignal.timeout(3000),
      cache: "no-store",
    });

    if (upstream.ok) {
      const data = await upstream.json();
      return NextResponse.json(data);
    }

    const errJson = await upstream.json().catch(() => ({}));
    return NextResponse.json(
      { error: "Upstream scorecard calculation failed", details: errJson },
      { status: upstream.status }
    );
  } catch (err: unknown) {
    return NextResponse.json(
      { error: "Upstream control plane unreachable; scorecard unavailable", details: String(err) },
      { status: 502 }
    );
  }
}
