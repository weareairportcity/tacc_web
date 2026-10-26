/** Commune's two installable apps share icons and colours; they start in different places. */
export function communeManifest(app: { name: string; short_name: string; start_url: string; scope: string }) {
  return Response.json(
    {
      ...app,
      description: "The camp app of The Airport City Church",
      display: "standalone",
      background_color: "#fafaf9",
      theme_color: "#fafaf9",
      icons: [
        { src: "/commune/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/commune/icon-512.png", sizes: "512x512", type: "image/png" },
        { src: "/commune/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" } },
  );
}
