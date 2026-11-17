// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
/**
 * Next.js Server Startup Instrumentation
 * Runs fail-closed production safety checks before serving traffic.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { verifyProductionSafety } = await import("./lib/startup-checks");
    verifyProductionSafety();
  }
}
