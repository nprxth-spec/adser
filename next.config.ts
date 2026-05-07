import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
      { source: "/naming", destination: "/dashboard/naming" },
      { source: "/review", destination: "/dashboard/review" },
    ];
  },
};

export default nextConfig;
