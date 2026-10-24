import type { NextConfig } from "next";

/**
 * The retired camp feature (removed in camp Phase 6). Its addresses can't map
 * to new camps, which are different records, so attendees land on the list of
 * camps and admins on the new camp admin. Order matters: admin paths first.
 */
export const RETIRED_CAMP_REDIRECTS = [
  { source: "/camp/admin/:path*", destination: "/admin/camp", permanent: true },
  { source: "/portal-admin-26/:path*", destination: "/admin/camp", permanent: true },
  { source: "/camp/:path*", destination: "/camps", permanent: true },
];

const nextConfig: NextConfig = {
  async redirects() {
    return RETIRED_CAMP_REDIRECTS;
  },
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
