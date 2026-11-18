// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
/**
 * CSRF helper for browser code.
 *
 * The proxy (apps/web/proxy.ts) enforces a double-submit check for
 * cookie-authenticated mutating requests: the `X-CSRF-Token` header must
 * match the non-HttpOnly `axiom_csrf` cookie issued alongside the session.
 *
 * Use `csrfFetch` for every mutating browser request so the header is
 * attached automatically.
 */

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function getCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)axiom_csrf=([^;]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export function csrfFetch(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> {
  const method = (
    init.method ?? (input instanceof Request ? input.method : "GET")
  ).toUpperCase();

  if (!MUTATING_METHODS.has(method)) {
    return fetch(input, init);
  }

  const headers = new Headers(init.headers);
  const token = getCsrfToken();
  if (token && !headers.has("x-csrf-token")) {
    headers.set("x-csrf-token", token);
  }

  return fetch(input, { ...init, headers });
}
