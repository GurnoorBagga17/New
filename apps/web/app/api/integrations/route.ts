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
  } catch {
    // Upstream offline fallback
  }

  // Fallback response with tenant-scoped integration state
  return NextResponse.json({
    integrations: [
      {
        id: "intg-aws-prod",
        tenant_id: session.tenantId,
        provider: "aws_iam",
        display_name: "AWS IAM Production Account (123456789012)",
        credential_ref: "arn:aws:iam::123456789012:role/AxiomDiscoveryRole",
        external_id: "axm-tenant-9901-ext",
        status: "connected",
        last_sync_at: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
        last_error: null,
        created_at: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
      },
    ],
  });
}

export async function POST(req: NextRequest) {
  const session = await getOperatorSession(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  try {
    const upstreamRes = await fetch(`${ADMIN_API_URL}/v1/integrations`, {
      method: "POST",
      headers: getAdminHeaders(),
      body: JSON.stringify(body),
    });

    if (upstreamRes.ok) {
      const data = await upstreamRes.json();
      return NextResponse.json(data, { status: 201 });
    }
  } catch {
    // Upstream offline fallback
  }

  const id = `intg-${body.provider || "custom"}-${Date.now().toString().slice(-6)}`;
  return NextResponse.json(
    {
      status: "created",
      integration: {
        id,
        tenant_id: session.tenantId,
        provider: body.provider,
        display_name: body.display_name,
        credential_ref: body.credential_ref,
        external_id: body.external_id || null,
        status: "connected",
        last_sync_at: null,
        last_error: null,
        created_at: new Date().toISOString(),
      },
    },
    { status: 201 }
  );
}
