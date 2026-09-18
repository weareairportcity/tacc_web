import { NextResponse } from "next/server";
import { format } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { supabaseAdmin } from "@/lib/supabase";
import { sendSMS } from "@/lib/mnotify";
import { getAccraTime } from "@/lib/date-utils";

/**
 * Hourly outreach-day SMS.
 *
 * GitHub Actions fires this hourly (Vercel Hobby only allows one cron a day).
 * The schedule cannot be scoped to a single date, so this route decides whether
 * today is an event day. Recipients, the message template, and the hour window
 * are read from the database so any of it can change mid-event without a redeploy.
 *
 * Every outcome is written to sw_sms_log, including the ones where nothing was
 * sent: on the day, "why didn't it text me?" needs an answer that isn't a guess.
 */

const TIMEZONE = "Africa/Accra";

type LogRow = {
  campaign_id: string | null;
  message: string;
  recipients: string[];
  total_souls: number | null;
  last_hour_souls: number | null;
  status: "sent" | "failed" | "skipped";
  error: string | null;
};

async function log(row: LogRow) {
  const { error } = await supabaseAdmin.from("sw_sms_log").insert(row);
  if (error) console.error("sw_sms_log insert failed:", error.message);
}

export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  try {
    const now = new Date();
    const accra = getAccraTime(now);
    const today = format(accra, "yyyy-MM-dd");
    const hour = accra.getHours();

    // Is today an event day?
    const { data: campaign } = await supabaseAdmin
      .from("sw_campaigns")
      .select("id, name, event_date, sms_template, sms_start_hour, sms_end_hour, goal_total")
      .eq("active", true)
      .eq("event_date", today)
      .maybeSingle();

    if (!campaign) {
      // Not an event day — the common case, and not worth a log row every hour.
      return NextResponse.json({ skipped: "no active campaign today", date: today });
    }

    if (hour < campaign.sms_start_hour || hour > campaign.sms_end_hour) {
      return NextResponse.json({
        skipped: "outside the campaign's SMS window",
        hour,
        window: [campaign.sms_start_hour, campaign.sms_end_hour],
      });
    }

    // Guard against a double fire: one message per campaign per clock hour.
    const hourStart = new Date(now);
    hourStart.setMinutes(0, 0, 0);
    const { data: alreadySent } = await supabaseAdmin
      .from("sw_sms_log")
      .select("id")
      .eq("campaign_id", campaign.id)
      .eq("status", "sent")
      .gte("sent_at", hourStart.toISOString())
      .limit(1);

    if (alreadySent && alreadySent.length > 0) {
      return NextResponse.json({ skipped: "already sent this hour", hour });
    }

    // Counted souls only, so flagged duplicates never inflate the number that
    // goes out to the pastor.
    const { count: totalSouls } = await supabaseAdmin
      .from("sw_soul_entries")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaign.id)
      .eq("counted", true);

    const sinceHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const { count: lastHourSouls } = await supabaseAdmin
      .from("sw_soul_entries")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaign.id)
      .eq("counted", true)
      .gte("created_at", sinceHourAgo);

    const { count: tongues } = await supabaseAdmin
      .from("sw_soul_entries")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaign.id)
      .eq("counted", true)
      .eq("spoke_in_tongues", true);

    const { count: church } = await supabaseAdmin
      .from("sw_soul_entries")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaign.id)
      .eq("counted", true)
      .eq("coming_to_church", true);

    const total = totalSouls ?? 0;
    const lastHour = lastHourSouls ?? 0;

    const message = campaign.sms_template
      .replaceAll("{total}", total.toLocaleString())
      .replaceAll("{last_hour}", lastHour.toLocaleString())
      .replaceAll("{time}", formatInTimeZone(now, TIMEZONE, "h:mmaaa"))
      .replaceAll("{tongues}", (tongues ?? 0).toLocaleString())
      .replaceAll("{church}", (church ?? 0).toLocaleString())
      .replaceAll("{goal}", campaign.goal_total ? campaign.goal_total.toLocaleString() : "—");

    const { data: configured } = await supabaseAdmin
      .from("sw_sms_config")
      .select("phone_number")
      .eq("campaign_id", campaign.id)
      .eq("enabled", true);

    const recipients = (configured ?? []).map((row) => row.phone_number);

    if (recipients.length === 0) {
      await log({
        campaign_id: campaign.id,
        message,
        recipients: [],
        total_souls: total,
        last_hour_souls: lastHour,
        status: "skipped",
        error: "no enabled recipients configured",
      });
      return NextResponse.json({ skipped: "no recipients", message });
    }

    // One number failing must not stop the others.
    const results = await Promise.all(
      recipients.map(async (phone) => ({ phone, ok: await sendSMS(phone, message) }))
    );

    const delivered = results.filter((result) => result.ok).map((result) => result.phone);
    const failed = results.filter((result) => !result.ok).map((result) => result.phone);

    await log({
      campaign_id: campaign.id,
      message,
      recipients: delivered,
      total_souls: total,
      last_hour_souls: lastHour,
      status: delivered.length > 0 ? "sent" : "failed",
      error: failed.length > 0 ? `failed for: ${failed.join(", ")}` : null,
    });

    return NextResponse.json({
      sent: delivered.length,
      failed: failed.length,
      total,
      lastHour,
      message,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown error";
    console.error("Soul winning SMS cron failed:", detail);
    await log({
      campaign_id: null,
      message: "",
      recipients: [],
      total_souls: null,
      last_hour_souls: null,
      status: "failed",
      error: detail,
    });
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
