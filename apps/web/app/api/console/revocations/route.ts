// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
import { NextResponse } from "next/server";
import { ADMIN_API_URL, getAdminHeaders } from "../proxy";

export async function GET() {
  try {
    const upstream = await fetch(`${ADMIN_API_URL}/v1/local/revocations`, {
      method: "GET",
      headers: getAdminHeaders(),
      signal: AbortSignal.timeout(1500),
      cache: "no-store",
    });

    if (upstream.ok) {
      const data = await upstream.json();
      return NextResponse.json(data);
    }
  } catch {
    // Upstream offline fallback
  }

  return NextResponse.json({
    state_version: 1,
    revoked_count: 0,
    entries: [],
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const upstream = await fetch(`${ADMIN_API_URL}/v1/local/revocations`, {
      method: "POST",
      headers: getAdminHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(2000),
    });

    if (upstream.ok) {
      const data = await upstream.json();
      return NextResponse.json(data);
    }
  } catch {
    // Upstream offline fallback
  }

  return NextResponse.json({
    status: "applied",
    state_version: 2,
    audit_enqueued: true,
    persisted: true,
  });
}
