import type { NextConfig } from "next";
import { fileURLToPath } from "url";
import path from "path";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: {
    root: projectRoot,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "*.googleusercontent.com",
      },
    ],
  },
  serverExternalPackages: ["pdf-parse"],
  async rewrites() {
    return [
      { source: "/history", destination: "/dashboard/history" },
      { source: "/billing", destination: "/dashboard/billing" },
      { source: "/settings", destination: "/dashboard/settings" },
      { source: "/integrations", destination: "/dashboard/integrations" },
      { source: "/connectors", destination: "/dashboard/connectors" },
      { source: "/naming", destination: "/dashboard/naming" },
      { source: "/review", destination: "/dashboard/review" },
      { source: "/analytics", destination: "/dashboard/analytics" },
    ];
  },
};

export default nextConfig;
