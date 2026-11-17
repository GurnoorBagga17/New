// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  // Protect /console and nested operator routes
  if (pathname.startsWith("/console")) {
    const isProduction = process.env.NODE_ENV === "production" || process.env.AXIOM_ENV === "production";
    const sessionCookie =
      request.cookies.get("axiom_session") || request.cookies.get("axm_session");

    // In production, demo bypass is strictly forbidden - require authenticated operator session
    if (isProduction) {
      if (!sessionCookie?.value) {
        const signInUrl = new URL("/sign-in", request.url);
        signInUrl.searchParams.set("next", pathname);
        return NextResponse.redirect(signInUrl);
      }
    } else {
      // In dev/evaluation, permit demo query only if explicitly enabled
      const demoRequested = searchParams.get("demo") === "true";
      const demoAllowed = process.env.NEXT_PUBLIC_DEMO_MODE === "1";

      if (!sessionCookie?.value && !(demoRequested && demoAllowed)) {
        const signInUrl = new URL("/sign-in", request.url);
        signInUrl.searchParams.set("next", pathname);
        return NextResponse.redirect(signInUrl);
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/console/:path*"],
};
