import { ImageResponse } from "next/og";
import { getMyRoom } from "@/lib/camp/assignments";
import { getCampBySlug } from "@/lib/camp/camps";
import { passQrPng } from "@/lib/camp/pass";
import { currentAttendee } from "@/lib/camp/session";

/** The pass as a PNG to keep in the phone's photos: name, camp, room and the check-in QR. */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const camp = await getCampBySlug(slug);
  const me = camp ? await currentAttendee(camp.id) : null;
  if (!camp || !me || me.status === "cancelled") return new Response("Not found", { status: 404 });
  const [qr, room] = await Promise.all([passQrPng(camp.id, me.id, 520), me.status === "fully_paid" ? getMyRoom(me.id) : null]);
  const dates = `${new Date(`${camp.starts_on}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })} – ${new Date(`${camp.ends_on}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}`;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#fafaf9", padding: 56, fontFamily: "sans-serif", color: "#0c0a09" }}>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, background: "#ffffff", borderRadius: 40, padding: 56, boxShadow: "0 12px 45px rgba(17,12,46,0.12)" }}>
          <div style={{ display: "flex", fontSize: 30, color: "#78716c" }}>commune · {camp.name}</div>
          <div style={{ display: "flex", fontSize: 72, marginTop: 24, letterSpacing: -2 }}>{me.full_name}</div>
          <div style={{ display: "flex", fontSize: 32, color: "#78716c", marginTop: 12 }}>
            {dates}
            {camp.venue ? ` · ${camp.venue}` : ""}
          </div>
          <div style={{ display: "flex", justifyContent: "center", marginTop: 56 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} width={520} height={520} alt="" />
          </div>
          <div style={{ display: "flex", justifyContent: "center", fontSize: 30, color: "#78716c", marginTop: 16 }}>Show at check-in</div>
          <div style={{ display: "flex", marginTop: "auto", gap: 48, fontSize: 30 }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ color: "#78716c", fontSize: 24 }}>Room</span>
              <span style={{ fontSize: 44 }}>{room?.label ?? "—"}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ color: "#78716c", fontSize: 24 }}>Type</span>
              <span style={{ fontSize: 44 }}>{me.room_type_name}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ color: "#78716c", fontSize: 24 }}>Payment</span>
              <span style={{ fontSize: 44 }}>{me.status === "fully_paid" ? "Paid in full" : "Outstanding"}</span>
            </div>
          </div>
        </div>
      </div>
    ),
    { width: 1080, height: 1500, headers: { "Cache-Control": "private, no-store", "Content-Disposition": `inline; filename="${camp.slug}-pass.png"` } },
  );
}
