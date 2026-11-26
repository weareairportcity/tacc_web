/**
 * Commune's two installable apps: "Commune" for attendees (black icon) and
 * "Commune Team" for coordinators and leaders (cyan icon), so someone who is
 * both can tell them apart on their Home Screen. personal: carries someone's
 * app pass, so it's never cached or shared.
 */
export function communeManifest(app: { name: string; short_name: string; start_url: string; scope: string; id?: string }, personal = false, team = false) {
  const icon = team ? "team-icon" : "icon";
  return Response.json(
    {
      ...app,
      description: team ? "Commune for camp coordinators and leaders, The Airport City Church" : "The camp app of The Airport City Church",
      display: "standalone",
      // A link opened while the app is installed goes to the app where the phone allows it (Android and desktop).
      launch_handler: { client_mode: ["navigate-existing", "auto"] },
      handle_links: "preferred",
      background_color: "#fafaf9",
      theme_color: "#fafaf9",
      icons: [
        { src: `/commune/${icon}-192.png`, sizes: "192x192", type: "image/png" },
        { src: `/commune/${icon}-512.png`, sizes: "512x512", type: "image/png" },
        { src: `/commune/${icon}-maskable-512.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json", "Cache-Control": personal ? "private, no-store" : "public, max-age=3600" } },
  );
}
