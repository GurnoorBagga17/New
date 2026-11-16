// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSession, getUserById } from "../store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("axiom_session");
    if (!sessionCookie || !sessionCookie.value) {
      return NextResponse.json(
        { authenticated: false, message: "No active session cookie found" },
        { status: 401 }
      );
    }

    const session = getSession(sessionCookie.value);
    if (!session) {
      return NextResponse.json(
        { authenticated: false, message: "Session expired or invalid" },
        { status: 401 }
      );
    }

    const user = getUserById(session.userId);

    return NextResponse.json({
      authenticated: true,
      userId: session.userId,
      tenantId: session.tenantId,
      email: user?.email ?? "operator@enterprise.local",
      name: user?.name ?? "Security Operator",
      role: session.role,
      csrfToken: session.csrfToken,
      expiresAtUnix: session.expiresAtUnix,
    });
  } catch (error) {
    console.error("GET /api/auth/me error:", error);
    return NextResponse.json(
      { authenticated: false, error: "Internal session resolution error" },
      { status: 500 }
    );
  }
}
