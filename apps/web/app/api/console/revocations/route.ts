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
    const upstream = await fetch(`${ADMIN_API_URL}/v1/local/revocations`, {
      method: "GET",
      headers: getAdminHeaders(),
      signal: AbortSignal.timeout(3000),
      cache: "no-store",
    });

    if (upstream.ok) {
      const data = await upstream.json();
      return NextResponse.json(data);
    }

    return NextResponse.json(
      { error: "Upstream control plane returned error", status: upstream.status },
      { status: upstream.status }
    );
  } catch (err: unknown) {
    return NextResponse.json(
      { error: "Upstream control plane unreachable", details: String(err) },
      { status: 502 }
    );
  }
}

export async function POST(req: NextRequest) {
  const session = await getOperatorSession(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Enforce role-based revocation authorization
  if (session.role !== "security-admin" && session.role !== "soc-operator") {
    return NextResponse.json(
      { error: `Forbidden: Role '${session.role}' is not authorized to execute emergency revocations` },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    // Pass along operator's step-up header if supplied
    const stepUpSig = req.headers.get("x-axiom-stepup-signature");
    const extraHeaders: Record<string, string> = {};
    if (stepUpSig) {
      extraHeaders["X-Axiom-StepUp-Signature"] = stepUpSig;
    }

    const upstream = await fetch(`${ADMIN_API_URL}/v1/local/revocations`, {
      method: "POST",
      headers: getAdminHeaders(extraHeaders),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(3000),
    });

    if (upstream.ok) {
      const data = await upstream.json();
      return NextResponse.json(data);
    }

    const errJson = await upstream.json().catch(() => ({}));
    return NextResponse.json(
      { error: "Upstream control plane failed to apply revocation", upstream_error: errJson },
      { status: upstream.status }
    );
  } catch (err: unknown) {
    return NextResponse.json(
      { error: "Upstream control plane unreachable; revocation NOT applied", details: String(err) },
      { status: 502 }
    );
  }
}
