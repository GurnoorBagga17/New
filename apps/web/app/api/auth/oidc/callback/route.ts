// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createSession, saveUser, usersByEmail, type TenantUserRecord } from "../../store";

/**
 * Handles the OAuth 2.0 / OIDC Authorization Code + PKCE callback (AX-003 / AUTH-03).
 * Validates cryptographic state against the session cookie, exchanges the code with the IdP,
 * verifies ID token claims (issuer, audience, expiry, nonce), provisions or retrieves the user,
 * and sets the authenticated session cookie.
 */
export async function GET(req: NextRequest) {
  const isProduction =
    process.env.NODE_ENV === "production" || process.env.AXIOM_ENV === "production";
  const searchParams = req.nextUrl.searchParams;

  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");
  if (error) {
    return NextResponse.json(
      { error: "OIDC_PROVIDER_ERROR", description: errorDescription || error },
      { status: 400 }
    );
  }

  const code = searchParams.get("code");
  const state = searchParams.get("state");

  if (!code || !state) {
    return NextResponse.json(
      { error: "Missing required authorization code or state parameter" },
      { status: 400 }
    );
  }

  // 1. Verify state against stored PKCE cookie
  const pkceCookie = req.cookies.get("axiom_oidc_pkce")?.value;
  if (!pkceCookie) {
    return NextResponse.json(
      { error: "Missing OIDC PKCE verification cookie; session may have expired" },
      { status: 400 }
    );
  }

  let pkceData: { state: string; nonce: string; codeVerifier: string };
  try {
    pkceData = JSON.parse(pkceCookie);
  } catch {
    return NextResponse.json({ error: "Malformed OIDC PKCE cookie" }, { status: 400 });
  }

  if (pkceData.state !== state) {
    return NextResponse.json(
      { error: "OIDC_STATE_MISMATCH: Invalid or forged state parameter" },
      { status: 403 }
    );
  }

  const issuer = process.env.AXIOM_OIDC_ISSUER_URL;
  const clientId = process.env.AXIOM_OIDC_CLIENT_ID;
  const clientSecret = process.env.AXIOM_OIDC_CLIENT_SECRET;
  const redirectUri =
    process.env.AXIOM_OIDC_REDIRECT_URI || req.nextUrl.origin + "/api/auth/oidc/callback";

  // In production, OIDC configuration is mandatory
  if (!issuer || !clientId) {
    if (isProduction || process.env.AXIOM_DEV_MODE !== "1") {
      return NextResponse.json(
        { error: "OIDC configuration missing (AXIOM_OIDC_ISSUER_URL and AXIOM_OIDC_CLIENT_ID are required)" },
        { status: 500 }
      );
    }
  }

  let userEmail = "";
  let userName = "";

  // 2. Perform live Token Exchange with IdP
  if (issuer && clientId) {
    const tokenEndpoint = `${issuer.replace(/\/$/, "")}/oauth/v2/token`;
    const tokenBody = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      code,
      redirect_uri: redirectUri,
      code_verifier: pkceData.codeVerifier,
    });
    if (clientSecret) {
      tokenBody.set("client_secret", clientSecret);
    }

    let tokenRes: Response;
    try {
      tokenRes = await fetch(tokenEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: tokenBody.toString(),
        signal: AbortSignal.timeout(5000),
      });
    } catch (err: unknown) {
      return NextResponse.json(
        { error: "Failed to connect to identity provider token endpoint", details: String(err) },
        { status: 502 }
      );
    }

    if (!tokenRes.ok) {
      const errText = await tokenRes.text().catch(() => "");
      return NextResponse.json(
        { error: "OIDC token exchange rejected by identity provider", status: tokenRes.status, details: errText },
        { status: 401 }
      );
    }

    const tokenJson = (await tokenRes.json().catch(() => ({}))) as Record<string, unknown>;
    if (typeof tokenJson.id_token !== "string") {
      return NextResponse.json(
        { error: "Identity provider response omitted mandatory 'id_token'" },
        { status: 401 }
      );
    }

    // 3. Verify ID Token Structure and Standard Claims
    const parts = tokenJson.id_token.split(".");
    const idTokenPayload = parts[1];
    if (parts.length !== 3 || !idTokenPayload) {
      return NextResponse.json(
        { error: "Malformed ID token structure; expected JWS 3-segment token" },
        { status: 401 }
      );
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(Buffer.from(idTokenPayload, "base64url").toString("utf-8"));
    } catch {
      return NextResponse.json(
        { error: "Malformed ID token payload encoding" },
        { status: 401 }
      );
    }

    // Expiry check
    const exp = typeof payload.exp === "number" ? payload.exp : 0;
    const nowUnix = Math.floor(Date.now() / 1000);
    if (exp <= nowUnix) {
      return NextResponse.json(
        { error: "ID token has expired", exp, now: nowUnix },
        { status: 401 }
      );
    }

    // Nonce check (mitigates replay injection)
    if (pkceData.nonce && payload.nonce !== pkceData.nonce) {
      return NextResponse.json(
        { error: "ID token nonce mismatch; possible replay attempt" },
        { status: 401 }
      );
    }

    // Issuer check (must match configured provider)
    if (payload.iss && typeof payload.iss === "string") {
      const cleanIss = payload.iss.replace(/\/$/, "");
      const cleanExpected = issuer.replace(/\/$/, "");
      if (cleanIss !== cleanExpected) {
        return NextResponse.json(
          { error: `ID token issuer mismatch (expected ${cleanExpected}, got ${cleanIss})` },
          { status: 401 }
        );
      }
    }

    // Audience check (must match client ID)
    if (payload.aud) {
      const audValid =
        payload.aud === clientId ||
        (Array.isArray(payload.aud) && payload.aud.includes(clientId));
      if (!audValid) {
        return NextResponse.json(
          { error: `ID token audience mismatch (expected client_id: ${clientId})` },
          { status: 401 }
        );
      }
    }

    // Email extraction
    if (typeof payload.email !== "string" || !payload.email.includes("@")) {
      return NextResponse.json(
        { error: "ID token did not contain a valid email claim" },
        { status: 401 }
      );
    }

    userEmail = payload.email.toLowerCase();
    userName = typeof payload.name === "string" ? payload.name : (userEmail.split("@")[0] || "operator");
  } else {
    // Only reachable in local dev mode when AXIOM_DEV_MODE=1 and issuer is omitted
    return NextResponse.json(
      { error: "OIDC requires configured AXIOM_OIDC_ISSUER_URL" },
      { status: 500 }
    );
  }

  // 4. Retrieve or provision the user in persistent storage
  let user: TenantUserRecord | undefined = usersByEmail.get(userEmail);
  if (!user) {
    user = {
      userId: `usr_${crypto.randomUUID()}`,
      tenantId: `tnt_${crypto.randomUUID()}`,
      name: userName,
      email: userEmail,
      passwordSaltHex: "oidc_federated",
      passwordHashHex: "oidc_federated",
      role: "operator",
      mfaEnabled: true,
      createdAtIso: new Date().toISOString(),
    };
    saveUser(user);
  }

  // 5. Create authoritative session and set secure cookie
  const session = createSession(user);
  const redirectTarget = new URL("/", req.nextUrl.origin);
  const response = NextResponse.redirect(redirectTarget, 303);

  response.cookies.set("axiom_session", session.sessionId, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    path: "/",
    maxAge: 3600 * 8,
  });

  // Double-submit CSRF token: readable by the browser, verified by proxy.ts
  response.cookies.set("axiom_csrf", session.csrfToken, {
    httpOnly: false,
    secure: isProduction,
    sameSite: "strict",
    path: "/",
    maxAge: 3600 * 8,
  });

  // Clear single-use PKCE cookie
  response.cookies.delete("axiom_oidc_pkce");

  return response;
}
