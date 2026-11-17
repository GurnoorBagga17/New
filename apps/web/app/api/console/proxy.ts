// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
// Upstream Rust Control Plane (:8787) proxy helper for Next.js server-side routes.

export const ADMIN_API_URL = process.env.AXIOM_ADMIN_API_URL || "http://127.0.0.1:8787";
export const ADMIN_TOKEN = process.env.AXIOM_ADMIN_TOKEN || "axm_local_dev_token_for_browser_testing";

export function getAdminHeaders(extra: Record<string, string> = {}): HeadersInit {
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${ADMIN_TOKEN}`,
    ...extra,
  };
}
