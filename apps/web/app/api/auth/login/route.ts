import { NextRequest, NextResponse } from "next/server";
import { createSession, usersByEmail, verifyPasswordScrypt } from "../store";

export async function POST(req: NextRequest) {
  try {
    const raw = await req.text();
    if (raw.length > 16384) {
      return NextResponse.json({ error: "Request payload exceeds 16 KiB limit" }, { status: 413 });
    }
    const body = JSON.parse(raw) as Record<string, unknown>;
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";

    const user = usersByEmail.get(email);
    if (!user || !verifyPasswordScrypt(password, user.passwordSaltHex, user.passwordHashHex)) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    // Rotate session ID on login to prevent session fixation
    const session = createSession(user);
    const response = NextResponse.json(
      {
        authenticated: true,
        userId: user.userId,
        tenantId: user.tenantId,
        role: user.role,
        csrfToken: session.csrfToken,
      },
      { status: 200 }
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
    return NextResponse.json({ error: "Invalid authentication request" }, { status: 400 });
  }
}
