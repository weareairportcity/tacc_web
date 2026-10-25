import { getCampBySlug } from "@/lib/camp/camps";

/** An .ics file with the day registration opens, for "Add to my calendar". */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const camp = await getCampBySlug(slug);
  if (!camp) return new Response("Not found", { status: 404 });

  const day = camp.registration_opens_on.replaceAll("-", "");
  const next = new Date(Date.parse(`${camp.registration_opens_on}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10).replaceAll("-", "");
  const url = `${new URL(_req.url).origin}/camps/${camp.slug}`;
  const escape = (s: string) => s.replace(/[\\,;]/g, (c) => `\\${c}`).replace(/\n/g, "\\n");
  const body = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//The Airport City Church//Commune//EN",
    "BEGIN:VEVENT",
    `UID:camp-opens-${camp.id}@theairportcitychurch.com`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
    `DTSTART;VALUE=DATE:${day}`,
    `DTEND;VALUE=DATE:${next}`,
    `SUMMARY:${escape(`Registration opens: ${camp.name}`)}`,
    `DESCRIPTION:${escape(`Register at ${url}`)}`,
    `URL:${url}`,
    "BEGIN:VALARM",
    "TRIGGER:PT9H",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escape(`${camp.name} registration is open`)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${camp.slug}-registration.ics"`,
    },
  });
}
