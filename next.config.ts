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
        // The Soul Winning service worker lives at /gic/sw.js but needs to
        // control /gic itself, which is one level up from its own path.
        source: "/gic/sw.js",
        headers: [
          { key: "Service-Worker-Allowed", value: "/gic" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
      {
        // Retired 1909 worker: a self-removing script. Never cached, so phones
        // that installed the 1909 app pick it up and clean themselves up.
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
