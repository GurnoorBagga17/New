// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/console/"],
      },
    ],
    sitemap: "https://axiomnhi.dev/sitemap.xml",
  };
}
