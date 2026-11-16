import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  ...(process.env.NEXT_STANDALONE === "true" ? { output: "standalone" as const } : {}),
  poweredByHeader: false,
  typescript: {
    ignoreBuildErrors: false,
  },
  experimental: {
    cpus: 1,
  },
};

export default nextConfig;
