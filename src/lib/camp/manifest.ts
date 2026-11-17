/** Commune's two installable apps share icons and colours; they start in different places. */
/** personal: carries someone's app pass, so it's never cached or shared. */
export function communeManifest(app: { name: string; short_name: string; start_url: string; scope: string; id?: string }, personal = false) {
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
    { headers: { "Content-Type": "application/manifest+json", "Cache-Control": personal ? "private, no-store" : "public, max-age=3600" } },
  );
}
