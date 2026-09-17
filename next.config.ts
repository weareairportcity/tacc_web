import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  async headers() {
    return [
      {
        // The Soul Winning service worker lives at /1909/sw.js but needs to
        // control /1909 itself, which is one level up from its own path.
        source: "/1909/sw.js",
        headers: [
          { key: "Service-Worker-Allowed", value: "/1909" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
    ];
  },
};

export default nextConfig;
