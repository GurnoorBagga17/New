// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sbomPath = path.resolve(process.cwd(), "../../docs/security/compliance/axiom-nhi-cyclonedx-1.6.sbom.json");
    let content = "";
    if (fs.existsSync(sbomPath)) {
      content = fs.readFileSync(sbomPath, "utf-8");
    } else {
      content = JSON.stringify({
        $schema: "http://cyclonedx.org/schema/bom-1.6.schema.json",
        bomFormat: "CycloneDX",
        specVersion: "1.6",
        serialNumber: "urn:uuid:7a92b8d0-e4b2-4d56-a971-d68a2bf62e91",
        version: 1,
        component: { name: "axiom-nhi", version: "1.0.0" }
      }, null, 2);
    }

    return new NextResponse(content, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.cyclonedx+json",
        "Content-Disposition": 'attachment; filename="axiom-nhi-cyclonedx-1.6.sbom.json"',
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
      },
    });
  } catch (error) {
    console.error("GET /api/sbom/download error:", error);
    return NextResponse.json({ error: "Failed to load SBOM" }, { status: 500 });
  }
}
