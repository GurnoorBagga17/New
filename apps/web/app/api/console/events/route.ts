// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
import { NextRequest } from "next/server";
import { ADMIN_API_URL, ADMIN_TOKEN } from "../proxy";
import { getOperatorSession } from "../../auth/store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getOperatorSession(req);
  if (!session) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();

  // Try upstream connection to live Rust ExtMCP SSE stream
  try {
    let streamUrl = `${ADMIN_API_URL}/v1/local/events/stream`;

    // Attempt to acquire a short-lived single-use SSE ticket nonce bound to the session
    try {
      const ticketRes = await fetch(`${ADMIN_API_URL}/v1/local/events/ticket`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ADMIN_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sub: session.userId,
          tenant_id: session.tenantId,
          role: session.role,
        }),
        signal: AbortSignal.timeout(1500),
      });
      if (ticketRes.ok) {
        const ticketData = (await ticketRes.json()) as { ticket?: string };
        if (ticketData?.ticket) {
          streamUrl = `${ADMIN_API_URL}/v1/local/events/stream?ticket=${ticketData.ticket}`;
        }
      }
    } catch {
      // Fallback to direct stream with Bearer header
    }

    const upstream = await fetch(streamUrl, {
      headers: {
        Accept: "text/event-stream",
        Authorization: `Bearer ${ADMIN_TOKEN}`,
      },
      signal: req.signal,
    });

    if (upstream.ok && upstream.body) {
      return new Response(upstream.body, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      });
    }
  } catch {
    // Upstream offline
  }

  // Explicitly inform client that upstream control plane is disconnected
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode(`event: stream_status\ndata: {"status":"upstream_offline","connected":false}\n\n`)
      );

      const interval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`event: ping\ndata: {"upstream":"offline"}\n\n`));
        } catch {
          clearInterval(interval);
        }
      }, 15000);

      req.signal.addEventListener("abort", () => {
        clearInterval(interval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
