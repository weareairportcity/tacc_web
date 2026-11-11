import { sendSms } from "./sms";
import { card, tellGroups, type TgKind } from "./telegram";
import { HttpError, json, nowIso, readJson, UUID, type AppEnv } from "./util";
import { pushConfigured, sendPush, type PushMessage } from "./webpush";

/**
 * Commune's notifications, in plain words.
 *
 *   Coordinators (admins and coordinators): app notifications on their phones
 *   and the Telegram group. Attendees: app notifications only.
 *
 * Each person turns kinds off on their own (camp_notify_prefs); the Telegram
 * group has its own switches (/settings). Nothing here ever throws into the
 * caller: a payment must never fail because a notification did.
 */

export const STAFF_PUSH_KINDS = ["registration", "payment", "payment_problem", "request"] as const;
export const ATTENDEE_KINDS = ["payment_received", "payment_failed", "room_ready", "request_answered", "due_soon", "camp_tomorrow"] as const;
export type StaffKind = TgKind;
export type AttendeeKind = (typeof ATTENDEE_KINDS)[number];

/** Where people open Commune. The receipt links in texts point here. */
export const communeOrigin = (env: AppEnv) => (env.COMMUNE_URL || "https://commune.theairportcitychurch.com").replace(/\/+$/, "");
export const receiptUrl = (env: AppEnv, reference: string) => `${communeOrigin(env)}/camps/r/${encodeURIComponent(reference)}`;

export const cedis = (pesewas: number) =>
  `GHS ${(pesewas / 100).toLocaleString("en-GH", { minimumFractionDigits: pesewas % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

const ICON: Record<StaffKind, string> = {
  registration: "🙋",
  payment: "💰",
  payment_problem: "⚠️",
  request: "📨",
  cancellation: "❌",
  daily: "🌙",
};

type Sub = { endpoint: string; p256dh: string; auth: string };

async function pushTo(env: AppEnv, ownerSql: string, binds: unknown[], kind: string, message: PushMessage) {
  if (!pushConfigured(env)) return 0;
  const { results } = await env.APP_DB.prepare(
    `SELECT s.endpoint, s.p256dh, s.auth FROM camp_push_subs s
     WHERE s.owner IN (${ownerSql})
       AND NOT EXISTS (SELECT 1 FROM camp_notify_prefs p, json_each(p.off_json) j WHERE p.owner = s.owner AND j.value = ?)`,
  )
    .bind(...binds, kind)
    .all<Sub>();
  let ok = 0;
  await Promise.all(
    (results ?? []).map(async (sub) => {
      const r = await sendPush(env, sub, message);
      if (r === "ok") {
        ok++;
        await env.APP_DB.prepare("UPDATE camp_push_subs SET last_ok_at = ?, fails = 0 WHERE endpoint = ?").bind(nowIso(), sub.endpoint).run();
      } else if (r === "gone") {
        await env.APP_DB.prepare("DELETE FROM camp_push_subs WHERE endpoint = ?").bind(sub.endpoint).run();
      } else {
        // A phone that keeps failing (10 in a row) is dropped; it subscribes again on its next visit.
        await env.APP_DB.prepare("UPDATE camp_push_subs SET fails = fails + 1 WHERE endpoint = ?").bind(sub.endpoint).run();
        await env.APP_DB.prepare("DELETE FROM camp_push_subs WHERE endpoint = ? AND fails >= 10").bind(sub.endpoint).run();
      }
    }),
  );
  return ok;
}

/** A Telegram line: label and value. Empty values are left out. */
export type Line = readonly [string, string] | string | null | false | 0;

/**
 * Coordinators: Telegram (for every kind) and app notifications (for the
 * main ones). `lines` lay the Telegram message out one fact per line; the
 * phone gets the short `body`.
 */
export async function toStaff(env: AppEnv, kind: StaffKind, m: { title: string; body: string; url: string; lines?: Line[] }) {
  try {
    const { lines, ...push0 } = m;
    const [telegram, push] = await Promise.all([
      tellGroups(env, kind, card(ICON[kind], m.title, lines?.length ? lines : [["Details", m.body]])),
      (STAFF_PUSH_KINDS as readonly string[]).includes(kind)
        ? pushTo(env, "SELECT 'staff:' || email FROM camp_staff WHERE role IN ('admin', 'coordinator')", [], kind, { ...push0, tag: kind })
        : 0,
    ]);
    return { telegram, push };
  } catch (err) {
    console.error("notify staff", kind, err);
    return { telegram: 0, push: 0 };
  }
}

/** One attendee's phones. */
export async function toAttendee(env: AppEnv, registrationId: string, kind: AttendeeKind, m: { title: string; body: string; url: string }) {
  try {
    return await pushTo(env, "?", [`attendee:${registrationId}`], kind, { ...m, tag: `${kind}:${registrationId}` });
  } catch (err) {
    console.error("notify attendee", kind, err);
    return 0;
  }
}

/** Claims a once-only notification. True the first time for this key. */
export async function once(env: AppEnv, key: string) {
  const r = await env.APP_DB.prepare("INSERT INTO camp_notify_once (key) VALUES (?) ON CONFLICT DO NOTHING").bind(key).run();
  return r.meta.changes === 1;
}

// ─── Payments (called from camp.ts) ─────────────────────────────────────────

type PaidPerson = {
  full_name: string;
  phone: string;
  status: string;
  price_pesewas: number;
  paid_pesewas: number;
  camp_id: string;
  camp_name: string;
  slug: string;
  payment_due_on: string;
  roommate_deadline_on: string;
  ends_on: string;
  room_type_name: string;
};

const person = (env: AppEnv, registrationId: string) =>
  env.APP_DB.prepare(
    `SELECT r.full_name, r.phone, r.status, r.price_pesewas, r.paid_pesewas, c.id AS camp_id, c.name AS camp_name, c.slug,
            c.payment_due_on, c.roommate_deadline_on, c.ends_on, COALESCE(t.name, '') AS room_type_name
     FROM camp_registrations r JOIN camps c ON c.id = r.camp_id LEFT JOIN camp_room_types t ON t.id = r.room_type_id
     WHERE r.id = ?`,
  )
    .bind(registrationId)
    .first<PaidPerson>();

const firstName = (name: string) => name.trim().split(/\s+/)[0];
const shortDay = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

/** Who a coordinator's or leader's payment is from, in words: "Zion leader", "kwame", or the note. */
export const payerWords = (paidBy: string) => {
  const leader = paidBy.match(/^leader:(?:fellowship|pfcc):(.+)$/);
  if (leader) return `${leader[1]} leader`;
  return paidBy.includes("@") ? paidBy.split("@")[0] : paidBy;
};

type Paid = { id: string; reference: string; amount_pesewas: number; fee_pesewas?: number; registration_id: string; bulk_id: string | null; payer_name: string | null; method?: string | null };
const METHOD: Record<string, string> = { momo: "Mobile money", card: "Card" };

/**
 * The receipt text, in plain English, worded for who paid: the person
 * themselves, someone else through their pay link (named), or a coordinator
 * paying for several people.
 */
export function receiptText(o: {
  first: string;
  camp: string;
  amount: number;
  left: number;
  receipt: string;
  /** Someone else who paid through the pay link, by the name they gave. */
  payer: string | null;
  /** Paid with others by a coordinator or leader; the note they wrote, if any. */
  bulk: { note: string | null } | null;
  fullyPaidFirstTime: boolean;
  roommatesBy: string | null;
}) {
  const what = o.bulk
    ? `your balance of ${cedis(o.amount)} for ${o.camp} has been paid for you${o.bulk.note ? ` (${o.bulk.note})` : ""}.`
    : o.payer
      ? `${o.payer} has paid ${cedis(o.amount)} towards your place at ${o.camp}.`
      : `we've received your payment of ${cedis(o.amount)} for ${o.camp}.`;
  const then = o.left > 0
    ? ` You have ${cedis(o.left)} left to pay.`
    : o.fullyPaidFirstTime
      ? ` You're now fully paid. Thank you!${o.roommatesBy ? ` Next, choose your roommates in Commune by ${o.roommatesBy}.` : ""}`
      : " You're fully paid.";
  return `Hi ${o.first}, ${what}${then} Receipt: ${o.receipt} - The Airport City Church`;
}

/**
 * A payment went through: the receipt text and app notification to the
 * attendee (once per payment), and, unless it's a share of a coordinator's
 * payment, the coordinators' update.
 */
export async function paymentReceived(env: AppEnv, p: Paid, actor: string, bulk: { note: string | null } | null = null) {
  try {
    const r = await person(env, p.registration_id);
    if (!r) return;
    const left = Math.max(0, r.price_pesewas - r.paid_pesewas);
    const full = r.status === "fully_paid";
    const receipt = receiptUrl(env, p.reference);
    // Someone else paid through the pay link (a coordinator's payment has its own wording).
    const payer = !p.bulk_id && p.payer_name && p.payer_name.trim() && p.payer_name.trim() !== r.full_name ? p.payer_name.trim() : null;

    if (await once(env, `receipt:${p.id}`)) {
      // "You're now fully paid" is said once per person, even across a refund and a second payment.
      const fullClaim =
        full &&
        (
          await env.APP_DB.prepare(
            `INSERT INTO camp_audit_log (camp_id, actor, action, entity, entity_id, after_json)
             SELECT ?1, ?2, 'registration.fully_paid_sms', 'registration', ?3, '{}'
             WHERE NOT EXISTS (SELECT 1 FROM camp_audit_log WHERE action = 'registration.fully_paid_sms' AND entity_id = ?3)`,
          )
            .bind(r.camp_id, actor, p.registration_id)
            .run()
        ).meta.changes === 1;
      const today = nowIso().slice(0, 10);
      if (/^233\d{9}$/.test(r.phone) && today <= r.ends_on) {
        const text = receiptText({
          first: firstName(r.full_name),
          camp: r.camp_name,
          amount: p.amount_pesewas,
          left,
          receipt,
          payer,
          bulk: p.bulk_id ? (bulk ?? { note: null }) : null,
          fullyPaidFirstTime: fullClaim,
          roommatesBy: today <= r.roommate_deadline_on ? shortDay(r.roommate_deadline_on) : null,
        });
        await sendSms(env, r.phone, text, "Commune");
      }
      const from = p.bulk_id ? "Your camp balance was paid for you" : payer ? `${payer} paid ${cedis(p.amount_pesewas)} for you` : `We received ${cedis(p.amount_pesewas)}`;
      await toAttendee(env, p.registration_id, "payment_received", {
        title: full ? "You're fully paid 🎉" : "Payment received",
        body: full
          ? `${from}. You're all set for ${r.camp_name}. Tap to see your receipt.`
          : `${from}. You have ${cedis(left)} left to pay by ${shortDay(r.payment_due_on)}. Tap to see your receipt.`,
        url: `/camps/r/${encodeURIComponent(p.reference)}`,
      });
    }

    if (!p.bulk_id) {
      await toStaff(env, "payment", {
        title: "Payment received",
        body: `${payer ? `${payer} paid for ${r.full_name}` : `${r.full_name} paid`}: ${cedis(p.amount_pesewas)}. ${full ? "Now fully paid." : `${cedis(left)} left.`}`,
        url: `/admin/camp/${r.camp_id}/people?person=${p.registration_id}`,
        lines: [
          ["Attendee", r.full_name],
          ["Paid by", payer ? `${payer} (pay link)` : `${r.full_name} (themselves)`],
          ["Amount", `${cedis(p.amount_pesewas)}${p.fee_pesewas ? ` + ${cedis(p.fee_pesewas)} fee` : ""}`],
          ["Paid with", p.method ? (METHOD[p.method] ?? "") : ""],
          ["Balance", full ? "Fully paid ✅" : `${cedis(left)} left of ${cedis(r.price_pesewas)}`],
          ["Room type", r.room_type_name],
          ["Camp", r.camp_name],
          ["Receipt no.", p.reference],
        ],
      });
    }
  } catch (err) {
    console.error("notify payment", p.reference, err);
  }
}

/** A coordinator or leader paid for several people: one update for the coordinators, naming them. */
export async function bulkPaymentReceived(env: AppEnv, b: { id: string; reference: string; camp_id: string; amount_pesewas: number; fee_pesewas?: number; paid_by: string; note: string | null }, people: number) {
  const camp = await env.APP_DB.prepare("SELECT name FROM camps WHERE id = ?").bind(b.camp_id).first<{ name: string }>();
  const { results: names } = await env.APP_DB.prepare(
    "SELECT r.full_name FROM camp_payments p JOIN camp_registrations r ON r.id = p.registration_id WHERE p.bulk_id = ? AND p.status = 'success' ORDER BY r.full_name",
  )
    .bind(b.id)
    .all<{ full_name: string }>();
  const list = (names ?? []).map((n) => n.full_name);
  const who = payerWords(b.paid_by);
  await toStaff(env, "payment", {
    title: "Payment received",
    body: `${who} paid ${cedis(b.amount_pesewas)} for ${people} ${people === 1 ? "person" : "people"}${b.note ? ` (${b.note})` : ""}.`,
    url: `/admin/camp/${b.camp_id}/money/paid?reference=${encodeURIComponent(b.reference)}`,
    lines: [
      ["Paid by", who],
      ["For", `${people} ${people === 1 ? "person" : "people"}`],
      ["People", list.length > 8 ? `${list.slice(0, 8).join(", ")} and ${list.length - 8} more` : list.join(", ")],
      ["Amount", `${cedis(b.amount_pesewas)}${b.fee_pesewas ? ` + ${cedis(b.fee_pesewas)} fee` : ""}`],
      ["Note", b.note ?? ""],
      ["Camp", camp?.name ?? ""],
      ["Receipt no.", b.reference],
    ],
  });
}

const PROBLEM: Record<string, string> = {
  amount_mismatch: "They paid a different amount from what was asked.",
  over_balance: "They paid after their balance was already covered, so the extra needs a refund.",
};

export async function paymentProblem(env: AppEnv, registrationId: string, flag: string, p?: { reference: string; charged_pesewas: number }) {
  try {
    const r = await person(env, registrationId);
    if (!r) return;
    await toStaff(env, "payment_problem", {
      title: "A payment needs a look",
      body: `${r.full_name}: ${PROBLEM[flag] ?? "a payment needs checking."} Open Money in Commune to sort it out.`,
      url: `/admin/camp/${r.camp_id}/money`,
      lines: [
        ["Attendee", r.full_name],
        ["What happened", PROBLEM[flag] ?? "A payment needs checking."],
        ["Amount", p ? cedis(p.charged_pesewas) : ""],
        ["Camp", r.camp_name],
        ["Receipt no.", p?.reference ?? ""],
        ["What to do", "Open Money in Commune and sort it out."],
      ],
    });
  } catch (err) {
    console.error("notify problem", err);
  }
}

export async function paymentFailed(env: AppEnv, registrationId: string, amountPesewas: number) {
  try {
    const r = await person(env, registrationId);
    if (!r) return;
    await toAttendee(env, registrationId, "payment_failed", {
      title: "Payment didn't go through",
      body: `Your payment of ${cedis(amountPesewas)} for ${r.camp_name} didn't go through, and no money was taken. You can try again in Commune.`,
      url: `/camps/${r.slug}/me`,
    });
  } catch (err) {
    console.error("notify failed", err);
  }
}

// ─── Reminders (hourly cron, at 9 am Ghana time) ─────────────────────────────

export const REMINDER_HOUR_UTC = 9;

export async function sendReminders(env: AppEnv, now = new Date(), force = false) {
  if (!force && now.getUTCHours() !== REMINDER_HOUR_UTC) return { skipped: "not the hour" };
  if (!pushConfigured(env)) return { skipped: "push not set up" };
  const day = (offset: number) => new Date(now.getTime() + offset * 86_400_000).toISOString().slice(0, 10);
  let due = 0;
  let tomorrow = 0;

  // Only people with notifications on, so a claim is never wasted on someone we can't reach.
  const { results: owing } = await env.APP_DB.prepare(
    `SELECT r.id, r.price_pesewas - r.paid_pesewas AS left, c.name, c.slug, c.payment_due_on FROM camp_registrations r JOIN camps c ON c.id = r.camp_id
     WHERE c.status IN ('open', 'closed') AND c.payment_due_on = ? AND r.status IN ('registered', 'partially_paid')
       AND EXISTS (SELECT 1 FROM camp_push_subs s WHERE s.owner = 'attendee:' || r.id)`,
  )
    .bind(day(3))
    .all<{ id: string; left: number; name: string; slug: string; payment_due_on: string }>();
  for (const r of owing ?? []) {
    if (!(await once(env, `due:${r.id}:${r.payment_due_on}`))) continue;
    due += await toAttendee(env, r.id, "due_soon", {
      title: "Payment due in 3 days",
      body: `${cedis(r.left)} left to pay for ${r.name} by ${shortDay(r.payment_due_on)}.`,
      url: `/camps/${r.slug}/me`,
    });
  }

  const { results: going } = await env.APP_DB.prepare(
    `SELECT r.id, c.name, c.slug, c.starts_on FROM camp_registrations r JOIN camps c ON c.id = r.camp_id
     WHERE c.starts_on = ? AND r.status <> 'cancelled'
       AND EXISTS (SELECT 1 FROM camp_push_subs s WHERE s.owner = 'attendee:' || r.id)`,
  )
    .bind(day(1))
    .all<{ id: string; name: string; slug: string; starts_on: string }>();
  for (const r of going ?? []) {
    if (!(await once(env, `tomorrow:${r.id}:${r.starts_on}`))) continue;
    tomorrow += await toAttendee(env, r.id, "camp_tomorrow", {
      title: "Camp starts tomorrow",
      body: `${r.name} starts tomorrow. Have your pass ready on your phone.`,
      url: `/camps/${r.slug}/me`,
    });
  }
  return { due, tomorrow };
}

// ─── Endpoints for the Next server ──────────────────────────────────────────

const OWNER = /^(attendee:[0-9a-f-]{36}|staff:[^\s@]+@[^\s@]+\.[^\s@]+)$/i;
const ALL_KINDS: string[] = [...ATTENDEE_KINDS, "registration", "payment", "payment_problem", "request", "cancellation"];

/** Events that happen on the Next side: registration, requests, cancellations, rooms. */
export async function notifyEndpoint(request: Request, env: AppEnv) {
  const b = await readJson<{ to?: unknown; kind?: unknown; registration_id?: unknown; title?: unknown; body?: unknown; url?: unknown; lines?: unknown }>(request);
  const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const lines: Line[] = Array.isArray(b.lines)
    ? b.lines.slice(0, 14).map((l) => (typeof l === "string" ? text(l, 40) : Array.isArray(l) ? ([text(l[0], 40), text(l[1], 300)] as const) : null))
    : [];
  const m = { title: text(b.title, 80), body: text(b.body, 300), url: text(b.url, 300) || "/camps", lines };
  if (!m.title || !m.body || !m.url.startsWith("/")) throw new HttpError(400, "title, body and a relative url required");
  if (b.to === "staff" && (b.kind === "registration" || b.kind === "request" || b.kind === "cancellation")) {
    return json(await toStaff(env, b.kind, m));
  }
  if (b.to === "attendee" && typeof b.registration_id === "string" && UUID.test(b.registration_id) && (b.kind === "room_ready" || b.kind === "request_answered")) {
    return json({ push: await toAttendee(env, b.registration_id, b.kind, { title: m.title, body: m.body, url: m.url }) });
  }
  throw new HttpError(400, "unknown notification");
}

/** A phone turning notifications on (or off: endpoint with remove). Push services are https; 127.0.0.1 is the tests' fake. */
export async function pushSubscribe(request: Request, env: AppEnv) {
  const b = await readJson<{ owner?: unknown; endpoint?: unknown; p256dh?: unknown; auth?: unknown; remove?: unknown }>(request);
  const endpoint = typeof b.endpoint === "string" && /^(https:\/\/|http:\/\/127\.0\.0\.1:\d+\/)/.test(b.endpoint) && b.endpoint.length < 1000 ? b.endpoint : null;
  if (!endpoint) throw new HttpError(400, "endpoint required");
  if (b.remove === true) {
    await env.APP_DB.prepare("DELETE FROM camp_push_subs WHERE endpoint = ?").bind(endpoint).run();
    return json({ ok: true });
  }
  const owner = typeof b.owner === "string" && OWNER.test(b.owner) ? b.owner.toLowerCase() : null;
  const key = (v: unknown) => (typeof v === "string" && /^[A-Za-z0-9_-]{16,200}$/.test(v) ? v : null);
  const p256dh = key(b.p256dh);
  const auth = key(b.auth);
  if (!owner || !p256dh || !auth) throw new HttpError(400, "owner and keys required");
  // A phone belongs to whoever turned notifications on last.
  await env.APP_DB.prepare(
    `INSERT INTO camp_push_subs (endpoint, p256dh, auth, owner) VALUES (?, ?, ?, ?)
     ON CONFLICT (endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth, owner = excluded.owner, fails = 0`,
  )
    .bind(endpoint, p256dh, auth, owner)
    .run();
  return json({ ok: true });
}

/** Read or change what a person turned off. */
export async function notifyPrefs(request: Request, env: AppEnv) {
  const b = await readJson<{ owner?: unknown; off?: unknown }>(request);
  const owner = typeof b.owner === "string" && OWNER.test(b.owner) ? b.owner.toLowerCase() : null;
  if (!owner) throw new HttpError(400, "owner required");
  if (Array.isArray(b.off)) {
    const off = [...new Set(b.off.filter((k): k is string => typeof k === "string" && ALL_KINDS.includes(k)))];
    await env.APP_DB.prepare(
      `INSERT INTO camp_notify_prefs (owner, off_json, updated_at) VALUES (?, ?, ?)
       ON CONFLICT (owner) DO UPDATE SET off_json = excluded.off_json, updated_at = excluded.updated_at`,
    )
      .bind(owner, JSON.stringify(off), nowIso())
      .run();
  }
  const row = await env.APP_DB.prepare("SELECT off_json FROM camp_notify_prefs WHERE owner = ?").bind(owner).first<{ off_json: string }>();
  const devices = await env.APP_DB.prepare("SELECT COUNT(*) AS n FROM camp_push_subs WHERE owner = ?").bind(owner).first<{ n: number }>();
  return json({ off: row ? (JSON.parse(row.off_json) as string[]) : [], devices: devices?.n ?? 0, key: env.VAPID_PUBLIC_KEY ?? null });
}
