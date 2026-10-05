import { sendSms } from "./sms";
import type { AppEnv } from "./util";

/**
 * Usage watchdog. Cloudflare has no usage alerts for Workers, D1 or R2 on the
 * free plan, so the hourly cron reads today's usage from the GraphQL
 * Analytics API and texts the admin phone when anything passes WARN_AT of its
 * free daily limit — once per metric per day. Supabase's egress overrun went
 * unnoticed until the project was restricted; this is so that can't recur
 * quietly here.
 *
 * Needs CF_ANALYTICS_TOKEN (an API token with Account Analytics: Read) and
 * ALERT_PHONE. Without them it does nothing.
 */

const ACCOUNT_ID = "6e70b4f40ddf212a330df4b52379fbe9";
const WARN_AT = 0.6;

// Free plan, per day.
const LIMITS = {
  worker_requests: { limit: 100_000, label: "Worker requests" },
  d1_rows_read: { limit: 5_000_000, label: "database rows read" },
  d1_rows_written: { limit: 100_000, label: "database rows written" },
} as const;

type Metric = keyof typeof LIMITS;
export type Usage = { day: string } & Record<Metric, number>;

type UsageEnv = AppEnv & { CF_ANALYTICS_TOKEN?: string; ALERT_PHONE?: string };

export async function readUsage(env: UsageEnv, now = new Date()): Promise<Usage | null> {
  if (!env.CF_ANALYTICS_TOKEN) return null;
  const day = now.toISOString().slice(0, 10);
  const query = `query ($account: String!, $start: Time!, $end: Time!, $day: Date!) {
    viewer {
      accounts(filter: { accountTag: $account }) {
        workersInvocationsAdaptive(limit: 100, filter: { datetime_geq: $start, datetime_leq: $end }) {
          sum { requests }
        }
        d1AnalyticsAdaptiveGroups(limit: 100, filter: { date_geq: $day, date_leq: $day }) {
          sum { rowsRead rowsWritten }
        }
      }
    }
  }`;
  const res = await fetch("https://api.cloudflare.com/client/v4/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.CF_ANALYTICS_TOKEN}` },
    body: JSON.stringify({
      query,
      variables: { account: ACCOUNT_ID, start: `${day}T00:00:00Z`, end: now.toISOString(), day },
    }),
  });
  const body = (await res.json()) as {
    data?: {
      viewer?: {
        accounts?: {
          workersInvocationsAdaptive?: { sum: { requests: number } }[];
          d1AnalyticsAdaptiveGroups?: { sum: { rowsRead: number; rowsWritten: number } }[];
        }[];
      };
    };
    errors?: { message: string }[];
  };
  if (!res.ok || body.errors?.length) {
    throw new Error(`analytics: ${body.errors?.map((e) => e.message).join("; ") ?? res.status}`);
  }
  const account = body.data?.viewer?.accounts?.[0];
  const sum = <T,>(rows: T[] | undefined, pick: (r: T) => number) =>
    (rows ?? []).reduce((n, r) => n + (pick(r) || 0), 0);
  return {
    day,
    worker_requests: sum(account?.workersInvocationsAdaptive, (r) => r.sum.requests),
    d1_rows_read: sum(account?.d1AnalyticsAdaptiveGroups, (r) => r.sum.rowsRead),
    d1_rows_written: sum(account?.d1AnalyticsAdaptiveGroups, (r) => r.sum.rowsWritten),
  };
}

/** Reads today's usage and texts ALERT_PHONE for anything past WARN_AT. */
export async function checkUsage(env: UsageEnv, opts: { notify?: boolean } = {}) {
  const usage = await readUsage(env);
  if (!usage) return { skipped: "CF_ANALYTICS_TOKEN not set" };

  const report = (Object.keys(LIMITS) as Metric[]).map((metric) => ({
    metric,
    value: usage[metric],
    limit: LIMITS[metric].limit,
    percent: Math.round((usage[metric] / LIMITS[metric].limit) * 1000) / 10,
  }));
  const over = report.filter((r) => r.value >= r.limit * WARN_AT);
  const alerted: string[] = [];

  if (opts.notify !== false && env.ALERT_PHONE) {
    for (const r of over) {
      // Insert first: if it's already there, this metric has warned today.
      const inserted = await env.DB.prepare(
        "INSERT OR IGNORE INTO usage_alerts (day, metric, value) VALUES (?, ?, ?)",
      )
        .bind(usage.day, r.metric, r.value)
        .run();
      if (!inserted.meta.changes) continue;
      const message =
        `TACC website alert: Cloudflare ${LIMITS[r.metric].label} are at ${r.percent}% of today's free limit ` +
        `(${r.value.toLocaleString("en-GB")} of ${r.limit.toLocaleString("en-GB")}). ` +
        `Check for screens or pages left refreshing. It resets at midnight UTC.`;
      if (await sendSms(env, env.ALERT_PHONE, message)) alerted.push(r.metric);
    }
  }
  return { day: usage.day, report, alerted };
}
