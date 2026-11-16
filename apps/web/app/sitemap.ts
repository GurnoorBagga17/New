// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = "https://axiomnhi.dev";
  const routes = [
    "",
    "/platform",
    "/integrations",
    "/compare",
    "/shadow-audit",
    "/playground",
    "/benchmarks",
    "/pricing",
    "/resources",
    "/docs",
    "/trust",
    "/security",
    "/solutions",
    "/changelog",
    "/about",
    "/contact",
    "/privacy",
    "/terms",
  ];

  return routes.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date("2026-03-31T00:00:00.000Z"),
    changeFrequency: route === "" || route === "/changelog" ? "daily" : "weekly",
    priority: route === "" ? 1.0 : route === "/platform" || route === "/integrations" ? 0.9 : 0.8,
  }));
}
