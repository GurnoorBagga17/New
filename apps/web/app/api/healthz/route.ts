import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "axiom-web-console",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
  });
}
