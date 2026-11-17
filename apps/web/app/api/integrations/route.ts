// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
import { NextRequest, NextResponse } from "next/server";
import { getOperatorSession } from "../auth/store";
import { ADMIN_API_URL, getAdminHeaders } from "../console/proxy";

export async function GET(req: NextRequest) {
  const session = await getOperatorSession(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const upstreamRes = await fetch(`${ADMIN_API_URL}/v1/integrations`, {
      headers: getAdminHeaders(),
      cache: "no-store",
    });

    if (upstreamRes.ok) {
      const data = await upstreamRes.json();
      return NextResponse.json(data);
    }

    // Upstream returned non-OK status
    console.error(`Upstream API returned status ${upstreamRes.status}`);
    return NextResponse.json(
      {
        error: "Upstream service unavailable",
        status: upstreamRes.status,
        message: "Integration service is temporarily unavailable. Please try again later.",
      },
      { status: 503 }
    );
  } catch (err) {
    console.error("Failed to fetch integrations from upstream:", err);
    
    // CRITICAL ARCHITECTURE COMPLIANCE:
    // Section 14: "Remove success fallbacks; implement OAuth/role connection setup,
    // durable per-tenant credentials, real test/sync lifecycle, and status events."
    //
    // DO NOT return fabricated "connected" status when backend is unavailable.
    // This violates production requirements and gives customers false security coverage.
    
    return NextResponse.json(
      {
        error: "Service unavailable",
        message: "Integration service is temporarily unavailable. Please try again later.",
        support_contact: "support@axiom.io",
      },
      { status: 503 }
    );
  }
}

export async function POST(req: NextRequest) {
  const session = await getOperatorSession(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify operator has permission to create integrations
  if (session.role !== "security-admin" && session.role !== "platform-engineer") {
    return NextResponse.json(
      { error: "Forbidden: Only security-admin or platform-engineer can create integrations" },
      { status: 403 }
    );
  }

  const body = await req.json();

  // Validate required fields
  if (!body.provider || !body.display_name) {
    return NextResponse.json(
      { error: "Missing required fields: provider, display_name" },
      { status: 400 }
    );
  }

  try {
    const upstreamRes = await fetch(`${ADMIN_API_URL}/v1/integrations`, {
      method: "POST",
      headers: getAdminHeaders(),
      body: JSON.stringify({
        ...body,
        tenant_id: session.tenantId, // Server-derived, never client-supplied
      }),
    });

    if (upstreamRes.ok) {
      const data = await upstreamRes.json();
      return NextResponse.json(data, { status: 201 });
    }

    // Upstream returned error
    const errorData = await upstreamRes.json().catch(() => ({ error: "Unknown error" }));
    return NextResponse.json(
      {
        error: "Failed to create integration",
        details: errorData,
      },
      { status: upstreamRes.status }
    );
  } catch (err) {
    console.error("Failed to create integration via upstream:", err);
    
    // DO NOT create fake "connected" integration when backend is unavailable
    return NextResponse.json(
      {
        error: "Service unavailable",
        message: "Integration service is temporarily unavailable. Please try again later.",
        support_contact: "support@axiom.io",
      },
      { status: 503 }
    );
  }
}
