// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
/**
 * Next.js 16 Proxy (the `middleware.ts` convention was renamed to `proxy.ts`)
 *
 * Architecture compliance:
 * - Section 8.3: "Request is CSRF-protected if cookie-authenticated and mutating"
 * - Section 13: Security controls for authentication
 *
 * CSRF model: double-submit. Login/registration/OIDC issue a non-HttpOnly
 * `axiom_csrf` cookie whose value is the session's CSRF token. Mutating
 * requests must send the same value in `X-CSRF-Token`. Bearer-token API
 * clients are not cookie-authenticated and are therefore exempt.
 */

import { NextRequest, NextResponse } from "next/server";

// Routes that require CSRF protection (mutating operations)
const CSRF_PROTECTED_PATHS = [
  "/api/auth/logout",
  "/api/integrations",
  "/api/console",
  "/api/billing/checkout",
  "/api/runtime/enrollment",
];

// Public routes that don't require authentication
const PUBLIC_PATHS = [
  "/",
  "/playground",
  "/docs",
  "/benchmarks",
  "/api/healthz",
  "/api/contact",
  "/api/billing/webhook", // Webhooks use signature verification, not session
];

/**
 * Match a path against a configured prefix on path-segment boundaries.
 * `"/"` only matches the root; `"/api/console"` matches `"/api/console/x"`
 * but not `"/api/consolex"`.
 */
function matchesPath(pathname: string, base: string): boolean {
  if (base === "/") return pathname === "/";
  return pathname === base || pathname.startsWith(`${base}/`);
}

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((base) => matchesPath(pathname, base));
}

function isCsrfProtectedPath(pathname: string): boolean {
  return CSRF_PROTECTED_PATHS.some((base) => matchesPath(pathname, base));
}

/** Constant-time string comparison to avoid token-length leakage. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function isSameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  // Non-browser clients omit Origin; CSRF is a browser-driven attack.
  if (!origin) return true;

  const host = req.headers.get("host");
  const protocol =
    req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "");

  const allowed = new Set<string>();
  if (host) {
    allowed.add(`${protocol}://${host}`);
    allowed.add(`https://${host}`);
    allowed.add(`http://${host}`);
  }
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (configured) allowed.add(configured.replace(/\/$/, ""));

  return allowed.has(origin);
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1. Add security headers to all responses
  const response = NextResponse.next();

  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "accelerometer=(), camera=(), geolocation=(), microphone=()"
  );

  // CSP for XSS prevention
  response.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Next.js requires unsafe-eval in dev
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
    ].join("; ")
  );

  // 2. Skip further checks for public paths (exact/segment match, never prefix)
  if (isPublicPath(pathname)) {
    return response;
  }

  const isMutating = !["GET", "HEAD", "OPTIONS"].includes(req.method);
  const hasBearerToken =
    req.headers.get("authorization")?.startsWith("Bearer ") ?? false;

  // 3. Apply CSRF protection for cookie-authenticated mutating requests
  if (isMutating && !hasBearerToken && isCsrfProtectedPath(pathname)) {
    const sessionCookie = req.cookies.get("axiom_session")?.value;

    if (!sessionCookie) {
      return NextResponse.json(
        { error: "Unauthorized: No session found" },
        { status: 401 }
      );
    }

    const csrfTokenHeader = req.headers.get("x-csrf-token");
    if (!csrfTokenHeader) {
      return NextResponse.json(
        {
          error: "Forbidden: CSRF token required",
          hint: "Include X-CSRF-Token header for mutating requests",
        },
        { status: 403 }
      );
    }

    const csrfTokenCookie = req.cookies.get("axiom_csrf")?.value;
    if (csrfTokenCookie) {
      if (!timingSafeEqual(csrfTokenHeader, csrfTokenCookie)) {
        return NextResponse.json(
          { error: "Forbidden: CSRF token mismatch" },
          { status: 403 }
        );
      }
    } else if (!isSameOrigin(req)) {
      // Older sessions may predate the `axiom_csrf` cookie; /api/auth/me
      // refreshes it. Until then, require a same-origin browser request.
      return NextResponse.json(
        { error: "Forbidden: Cross-origin request rejected" },
        { status: 403 }
      );
    }
  }

  // 4. Reject cross-origin writes to protected APIs; log other API traffic
  if (pathname.startsWith("/api/") && isMutating && !isSameOrigin(req)) {
    console.warn(`Cross-origin API request blocked: ${req.method} ${pathname}`);
    return NextResponse.json(
      { error: "Forbidden: Cross-origin request rejected" },
      { status: 403 }
    );
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico (favicon file)
     * - public folder files
     */
    "/((?!_next/static|_next/image|favicon.ico|public/).*)",
  ],
};
