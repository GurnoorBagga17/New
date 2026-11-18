// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
// Upstream Rust Control Plane (:8787) proxy helper for Next.js server-side routes.

const isProduction =
  process.env.NODE_ENV === "production" || process.env.AXIOM_ENV === "production";

export const ADMIN_API_URL = process.env.AXIOM_ADMIN_API_URL || "http://127.0.0.1:8787";

/**
 * Resolve the control-plane admin token at request time.
 *
 * Deliberately lazy: throwing during module evaluation breaks `next build`,
 * which collects route configuration without runtime secrets. Production
 * deployments must set AXIOM_ADMIN_TOKEN; the dev fallback is only reachable
 * outside production.
 */
export function getAdminToken(): string {
  const token = process.env.AXIOM_ADMIN_TOKEN?.trim();
  if (token) {
    return token;
  }
  if (isProduction) {
    throw new Error(
      "Fatal: AXIOM_ADMIN_TOKEN must be set in production mode for server-side proxy operations"
    );
  }
  return "axm_local_dev_token_for_browser_testing";
}

export function getAdminHeaders(extra: Record<string, string> = {}): HeadersInit {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${getAdminToken()}`,
    ...extra,
  };
}
