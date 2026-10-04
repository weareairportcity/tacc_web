import type { Campaign, CountsRow } from "./db";
import { computeLeaderboard } from "./leaderboard";
import type { AppEnv } from "./util";

/**
 * Hourly outreach-day SMS, run by the Worker's cron trigger. Ported from the
 * old /api/cron/soulwinning-sms route: it decides whether today is an event
 * day and inside the campaign's SMS hours, sends at most once per clock hour,
 * and logs every outcome to sms_log so "why didn't it text me?" has an answer.
 * Ghana is UTC+0, so UTC hours and dates are Accra's.
 */

const formatTime = (d: Date) => {
  const h = d.getUTCHours();
  const m = String(d.getUTCMinutes()).padStart(2, "0");
  return `${h % 12 || 12}:${m}${h < 12 ? "am" : "pm"}`;
};

const toGhana = (phone: string) => {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("233")) return digits;
  if (digits.startsWith("0")) return `233${digits.slice(1)}`;
  return `233${digits}`;
};

async function sendSms(env: AppEnv, to: string, message: string) {
  if (!env.MNOTIFY_API_KEY) return false;
  try {
    const res = await fetch(
      `https://api.mnotify.com/api/sms/quick?key=${encodeURIComponent(env.MNOTIFY_API_KEY)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient: [toGhana(to)],
          sender: env.MNOTIFY_SENDER_ID || "TACCBooking",
          message,
          is_schedule: "false",
          schedule_date: "",
        }),
      },
    );
    return res.ok;
  } catch {
    return false;
  }
}

async function log(
  env: AppEnv,
  row: {
    campaign_id: string | null;
    message: string;
    recipients: string[];
    total_souls: number | null;
    last_hour_souls: number | null;
    status: "sent" | "failed" | "skipped";
    error: string | null;
  },
) {
  await env.DB.prepare(
    `INSERT INTO sms_log (id, campaign_id, message, recipients, total_souls, last_hour_souls, status, error)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      row.campaign_id,
      row.message,
      JSON.stringify(row.recipients),
      row.total_souls,
      row.last_hour_souls,
      row.status,
      row.error,
    )
    .run();
}

export async function runSms(env: AppEnv, now: Date, force = false) {
  try {
    const today = now.toISOString().slice(0, 10);
    const hour = now.getUTCHours();

    const campaign = await env.DB.prepare("SELECT * FROM campaigns WHERE event_date = ? LIMIT 1")
      .bind(today)
      .first<Campaign>();
    if (!campaign) return { skipped: "no campaign today", date: today };

    if (!force && (hour < campaign.sms_start_hour || hour > campaign.sms_end_hour)) {
      return { skipped: "outside the SMS hours", hour };
    }

    const hourStart = new Date(now);
    hourStart.setUTCMinutes(0, 0, 0);
    const already = await env.DB.prepare(
      "SELECT 1 FROM sms_log WHERE campaign_id = ? AND status = 'sent' AND sent_at >= ? LIMIT 1",
    )
      .bind(campaign.id, hourStart.toISOString())
      .first();
    if (already && !force) return { skipped: "already sent this hour", hour };

    const counts = await env.DB.prepare("SELECT * FROM counts WHERE campaign_id = ?")
      .bind(campaign.id)
      .first<CountsRow>();
    const lastHour =
      (
        await env.DB.prepare(
          "SELECT count(*) AS n FROM entries WHERE campaign_id = ? AND counted AND created_at >= ?",
        )
          .bind(campaign.id, new Date(now.getTime() - 60 * 60 * 1000).toISOString())
          .first<{ n: number }>()
      )?.n ?? 0;

    const total = counts?.total_souls ?? 0;
    const board = await computeLeaderboard(env.DB, campaign);
    const top = (rows: { souls: number }[], label: (r: never) => string) =>
      rows[0] ? `${label(rows[0] as never)} (${rows[0].souls})` : "—";
    const message = campaign.sms_template
      .replaceAll("{total}", total.toLocaleString("en-GB"))
      .replaceAll("{last_hour}", lastHour.toLocaleString("en-GB"))
      .replaceAll("{time}", formatTime(now))
      .replaceAll("{tongues}", (counts?.tongues_count ?? 0).toLocaleString("en-GB"))
      .replaceAll("{church}", (counts?.church_count ?? 0).toLocaleString("en-GB"))
      .replaceAll("{goal}", campaign.goal_total ? campaign.goal_total.toLocaleString("en-GB") : "—")
      .replaceAll("{completed}", board.completed.length.toLocaleString("en-GB"))
      .replaceAll("{top_pfcc}", top(board.pfccs, (r: { pfcc: string }) => r.pfcc))
      .replaceAll("{top_member}", top(board.members, (r: { name: string }) => r.name))
      .replaceAll("{first_to_target}", board.completed[0]?.name ?? "—");

    const { results } = await env.DB.prepare(
      "SELECT phone_number FROM sms_config WHERE campaign_id = ? AND enabled = 1",
    )
      .bind(campaign.id)
      .all<{ phone_number: string }>();
    const recipients = (results ?? []).map((r) => r.phone_number);

    if (recipients.length === 0) {
      await log(env, {
        campaign_id: campaign.id,
        message,
        recipients: [],
        total_souls: total,
        last_hour_souls: lastHour,
        status: "skipped",
        error: "no enabled recipients configured",
      });
      return { skipped: "no recipients", message };
    }

    const sent = await Promise.all(recipients.map(async (to) => ({ to, ok: await sendSms(env, to, message) })));
    const delivered = sent.filter((s) => s.ok).map((s) => s.to);
    const failed = sent.filter((s) => !s.ok).map((s) => s.to);
    await log(env, {
      campaign_id: campaign.id,
      message,
      recipients: delivered,
      total_souls: total,
      last_hour_souls: lastHour,
      status: delivered.length ? "sent" : "failed",
      error: failed.length ? `failed for: ${failed.join(", ")}` : null,
    });
    return { sent: delivered.length, failed: failed.length, total, lastHour, message };
  } catch (err) {
    const detail = err instanceof Error ? err.message : "unknown error";
    await log(env, {
      campaign_id: null,
      message: "",
      recipients: [],
      total_souls: null,
      last_hour_souls: null,
      status: "failed",
      error: detail,
    }).catch(() => {});
    return { error: detail };
  }
}
