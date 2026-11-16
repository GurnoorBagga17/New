import crypto from "crypto";
import { NextResponse } from "next/server";

/**
 * Initiates an OAuth 2.0 / OIDC Authorization Code + PKCE flow (AX-003).
 * Generates cryptographic `state`, `nonce`, and `S256` `code_challenge`.
 */
export async function POST() {
  const issuer = process.env.AXIOM_OIDC_ISSUER_URL;
  const clientId = process.env.AXIOM_OIDC_CLIENT_ID;
  const redirectUri = process.env.AXIOM_OIDC_REDIRECT_URI;

  if (!issuer || !clientId || !redirectUri) {
    return NextResponse.json(
      {
        configured: false,
        error: "Enterprise OIDC/SAML federation is not configured in this environment (set AXIOM_OIDC_ISSUER_URL, AXIOM_OIDC_CLIENT_ID, AXIOM_OIDC_REDIRECT_URI).",
      },
      { status: 501 }
    );
  }

  const state = crypto.randomBytes(24).toString("base64url");
  const nonce = crypto.randomBytes(24).toString("base64url");
  const codeVerifier = crypto.randomBytes(32).toString("base64url");
  const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");

  const authUrl = new URL(`${issuer.replace(/\/$/, "")}/authorize`);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("scope", "openid profile email");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("nonce", nonce);
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  const response = NextResponse.json({
    configured: true,
    authorizationUrl: authUrl.toString(),
  });
  response.cookies.set("axiom_oidc_pkce", JSON.stringify({ state, nonce, codeVerifier }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return response;
}
