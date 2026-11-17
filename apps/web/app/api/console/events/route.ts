// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
import { ADMIN_API_URL, ADMIN_TOKEN } from "../proxy";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const encoder = new TextEncoder();

  // Try upstream connection to live Rust ExtMCP SSE stream
  try {
    let streamUrl = `${ADMIN_API_URL}/v1/local/events/stream`;

    // Attempt to acquire a short-lived single-use SSE ticket nonce
    try {
      const ticketRes = await fetch(`${ADMIN_API_URL}/v1/local/events/ticket`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ADMIN_TOKEN}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(1000),
      });
      if (ticketRes.ok) {
        const ticketData = (await ticketRes.json()) as { ticket?: string };
        if (ticketData?.ticket) {
          streamUrl = `${ADMIN_API_URL}/v1/local/events/stream?ticket=${ticketData.ticket}`;
        }
      }
    } catch {
      // Fallback to direct Bearer stream URL
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
    // Upstream offline: stream keep-alives and synthetic traffic updates
  }

  // Fallback SSE stream for offline development / edge preview
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode(`event: stream_status\ndata: {"status":"edge_fallback_active"}\n\n`)
      );

      const interval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`event: ping\ndata: {}\n\n`));
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
