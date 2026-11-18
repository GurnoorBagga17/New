import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createSession, hashPasswordScrypt, saveUser, usersByEmail, type TenantUserRecord } from "../store";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  try {
    const raw = await req.text();
    if (raw.length > 16384) {
      return NextResponse.json({ error: "Request payload exceeds 16 KiB limit" }, { status: 413 });
    }
    const body = JSON.parse(raw) as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (name.length < 2 || name.length > 120) {
      return NextResponse.json({ error: "Full name must be between 2 and 120 characters" }, { status: 400 });
    }
    if (!EMAIL_REGEX.test(email) || email.length > 254) {
      return NextResponse.json({ error: "A valid work email address is required" }, { status: 400 });
    }
    if (password.length < 12 || password.length > 128) {
      return NextResponse.json({ error: "Password must be at least 12 characters" }, { status: 400 });
    }
    if (usersByEmail.has(email)) {
      return NextResponse.json({ error: "An account for this email already exists" }, { status: 409 });
    }

    // Workstream B4: Enforce invite code verification in production unless open self-registration is explicitly set
    if (process.env.NODE_ENV === "production" && process.env.AXIOM_ALLOW_OPEN_REGISTRATION !== "true") {
      const inviteCode = typeof body.inviteCode === "string" ? body.inviteCode.trim() : "";
      const expectedCode = process.env.AXIOM_INVITE_CODE;
      if (!expectedCode || inviteCode !== expectedCode) {
        return NextResponse.json(
          { error: "Public registration is disabled. A valid organization invite code is required." },
          { status: 403 }
        );
      }
    }

    const { saltHex, hashHex } = hashPasswordScrypt(password);
    const user: TenantUserRecord = {
      userId: `usr_${crypto.randomUUID()}`,
      tenantId: `tnt_${crypto.randomUUID()}`,
      name,
      email,
      passwordSaltHex: saltHex,
      passwordHashHex: hashHex,
      role: "security-admin",
      mfaEnabled: false,
      createdAtIso: new Date().toISOString(),
    };
    saveUser(user);

    const session = createSession(user);
    const response = NextResponse.json(
      {
        authenticated: true,
        userId: user.userId,
        tenantId: user.tenantId,
        role: user.role,
        csrfToken: session.csrfToken,
      },
      { status: 201 }
    );
    response.cookies.set("axiom_session", session.sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 3600 * 8,
    });
    // Double-submit CSRF token: readable by the browser, verified by proxy.ts
    response.cookies.set("axiom_csrf", session.csrfToken, {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 3600 * 8,
    });
    return response;
  } catch {
    return NextResponse.json({ error: "Invalid registration payload" }, { status: 400 });
  }
}
