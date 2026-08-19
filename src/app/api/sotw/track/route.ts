import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { song_id, event_type, visitor_id } = body;

    if (!song_id || !event_type || !visitor_id) {
      return NextResponse.json(
        { error: "Missing required fields: song_id, event_type, visitor_id" },
        { status: 400 }
      );
    }

    if (event_type !== "view" && event_type !== "play" && event_type !== "repeat") {
      return NextResponse.json({ error: "Invalid event_type" }, { status: 400 });
    }

    const { error } = await supabaseAdmin.from("sotw_analytics_events").insert([
      {
        song_id,
        event_type,
        visitor_id,
      },
    ]);

    if (error) {
      console.warn("Analytics log error (table may need creation):", error.message);
      return NextResponse.json({ success: false, message: error.message }, { status: 200 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Analytics API error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
