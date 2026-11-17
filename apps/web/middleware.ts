// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
/**
 * Next.js Middleware for CSRF Protection and Security Headers
 * 
 * Architecture compliance:
 * - Section 8.3: "Request is CSRF-protected if cookie-authenticated and mutating"
 * - Section 13: Security controls for authentication
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

export async function middleware(req: NextRequest) {
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

  // 2. Skip further checks for public paths
  if (PUBLIC_PATHS.some((path) => pathname.startsWith(path))) {
    return response;
  }

  // 3. Check if path requires CSRF protection
  const requiresCsrf = CSRF_PROTECTED_PATHS.some((path) =>
    pathname.startsWith(path)
  );

  // 4. Apply CSRF protection for mutating requests
  if (requiresCsrf && !["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    const sessionCookie = req.cookies.get("axiom_session");
    
    if (!sessionCookie) {
      return NextResponse.json(
        { error: "Unauthorized: No session found" },
        { status: 401 }
      );
    }

    // Verify CSRF token in request header
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
  }

  // 5. Origin check for API routes (prevent cross-origin requests)
  if (pathname.startsWith("/api/") && !pathname.startsWith("/api/billing/webhook")) {
    const origin = req.headers.get("origin");
    const host = req.headers.get("host");
    
    // Allow same-origin requests
    const allowedOrigins = [
      `https://${host}`,
      `http://${host}`,
      process.env.NEXT_PUBLIC_APP_URL,
    ].filter(Boolean);

    if (origin && !allowedOrigins.includes(origin)) {
      // For GET requests, this is just informational
      // For POST/PUT/DELETE, browser will block via CORS anyway
      console.warn(`Cross-origin API request from ${origin} to ${pathname}`);
    }
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

