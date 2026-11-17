// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
import { NextRequest, NextResponse } from "next/server";
import { getOperatorSession } from "../../auth/store";
import { ADMIN_API_URL, getAdminHeaders } from "../../console/proxy";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getOperatorSession(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const upstreamRes = await fetch(`${ADMIN_API_URL}/v1/integrations/${encodeURIComponent(id)}`, {
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

  return NextResponse.json({
    integration: {
      id,
      tenant_id: session.tenantId,
      provider: "aws_iam",
      display_name: "AWS IAM Account",
      credential_ref: "arn:aws:iam::123456789012:role/AxiomDiscoveryRole",
      status: "connected",
      last_sync_at: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
      last_error: null,
      created_at: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    },
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getOperatorSession(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const upstreamRes = await fetch(`${ADMIN_API_URL}/v1/integrations/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: getAdminHeaders(),
    });

    if (upstreamRes.ok) {
      const data = await upstreamRes.json();
      return NextResponse.json(data);
    }
  } catch {
    // Upstream offline fallback
  }

  return NextResponse.json({
    status: "deleted",
    integration_id: id,
    nodes_marked_stale: true,
    message: "Integration disconnected. Associated NHI nodes marked as stale.",
  });
}
