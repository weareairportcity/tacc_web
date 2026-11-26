import { logCampSms, sendSms, smsParts } from "./sms";
import { card, tellGroups, type TgKind } from "./telegram";
import { HttpError, json, nowIso, readJson, UUID, type AppEnv } from "./util";
import { pushConfigured, sendPush, type PushMessage } from "./webpush";
import { forAccount } from "./account-url";
import { groupForFellowship, pfccForFellowship } from "../../../src/lib/fellowships";

/**
 * Commune's notifications, in plain words.
 *
 *   Coordinators (admins and coordinators): app notifications on their phones
 *   and the Telegram group. Attendees: app notifications. A text only when no
 *   phone of theirs got the notification, except when someone else paid:
 *   then they get the text as well (texts cost credits).
 *
 * Each person turns kinds off on their own (camp_notify_prefs); the Telegram
 * group has its own switches (/settings). Nothing here ever throws into the
 * caller: a payment must never fail because a notification did.
 */

export const STAFF_PUSH_KINDS = ["registration", "payment", "payment_problem", "request"] as const;
export const ATTENDEE_KINDS = ["payment_received", "payment_failed", "room_ready", "request_answered", "due_soon", "camp_tomorrow", "messages"] as const;
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

type Sub = { endpoint: string; p256dh: string; auth: string; owner: string };



/**
 * The Notifications page: one row per owner for every app notification,
 * written even when no phone of theirs gets it (no phone, or that kind
 * turned off), so the page is the whole history. Never throws.
 */
async function keepInInbox(env: AppEnv, ownerSql: string, binds: unknown[], kind: string, message: PushMessage) {
  try {
    const owners = /^\s*SELECT\b/i.test(ownerSql)
      ? ((await env.APP_DB.prepare(ownerSql).bind(...binds).raw()) as unknown[][]).map((r) => r[0])
      : binds;
    const unique = [...new Set(owners.filter((o): o is string => typeof o === "string" && o.length > 0))];
    for (let i = 0; i < unique.length; i += 100) {
      await env.APP_DB.batch(
        unique.slice(i, i + 100).map((owner) =>
          env.APP_DB.prepare("INSERT INTO camp_inbox (owner, kind, title, body, url) VALUES (?, ?, ?, ?, ?)").bind(owner, kind, message.title, message.body, message.url),
        ),
      );
    }
  } catch (err) {
    console.error("inbox", kind, err);
  }
}

async function pushTo(env: AppEnv, ownerSql: string, binds: unknown[], kind: string, message: PushMessage) {
  await keepInInbox(env, ownerSql, binds, kind, message);
  if (!pushConfigured(env)) return 0;
  const { results } = await env.APP_DB.prepare(
    `SELECT s.endpoint, s.p256dh, s.auth, s.owner FROM camp_push_subs s
     WHERE s.owner IN (${ownerSql})
       AND NOT EXISTS (SELECT 1 FROM camp_notify_prefs p, json_each(p.off_json) j WHERE p.owner = s.owner AND j.value = ?)`,
  )
    .bind(...binds, kind)
    .all<Sub>();
  let ok = 0;
  // A phone with two of these accounts gets it once.
  const seen = new Set<string>();
  const subs = (results ?? []).filter((s) => !seen.has(s.endpoint) && seen.add(s.endpoint));
  await Promise.all(
    subs.map(async (sub) => {
      const r = await sendPush(env, sub, { ...message, url: forAccount(message.url, sub.owner) });
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

/** App notifications to these owners (each also kept for their Notifications page). Answers how many phones got it. */
export async function pushToOwners(env: AppEnv, owners: string[], kind: string, message: PushMessage) {
  if (!owners.length) return 0;
  return pushTo(env, owners.map(() => "?").join(","), owners, kind, message);
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

/**
 * The leaders whose fellowship, PFCC or group this person is in (each leader
 * code is one owner; everyone sharing the code gets it; each Group Leader has
 * their own). The group comes from the fellowship (src/lib/fellowships.ts).
 * Kinds: registration, payment, request. Never throws.
 */
export async function toLeaders(env: AppEnv, registrationId: string, kind: "registration" | "payment" | "request", m: { title: string; body: string; url: (campId: string) => string }) {
  try {
    const r = await env.APP_DB.prepare("SELECT camp_id, fellowship FROM camp_registrations WHERE id = ?").bind(registrationId).first<{ camp_id: string; fellowship: string }>();
    if (!r) return 0;
    return await pushTo(
      env,
      `SELECT 'leader:' || l.id FROM camp_leader_codes l, camp_registrations p
       WHERE p.id = ? AND l.revoked_at IS NULL
         AND ((l.scope_kind = 'fellowship' AND l.scope_value = p.fellowship) OR (l.scope_kind = 'pfcc' AND l.scope_value = p.pfcc)
           OR (l.scope_kind = 'group' AND l.scope_value = ?))`,
      [registrationId, groupForFellowship(r.fellowship) ?? ""],
      kind,
      { title: m.title, body: m.body, url: m.url(r.camp_id), tag: `leader-${kind}:${registrationId}` },
    );
  } catch (err) {
    console.error("notify leaders", kind, err);
    return 0;
  }
}

/** The leader codes that look after a fellowship: its own, its PFCC's and its group's. */
async function leaderOwners(env: AppEnv, fellowship: string): Promise<string[]> {
  const { results } = await env.APP_DB.prepare(
    `SELECT 'leader:' || id AS owner FROM camp_leader_codes
     WHERE revoked_at IS NULL AND ((scope_kind = 'fellowship' AND scope_value = ?) OR (scope_kind = 'pfcc' AND scope_value = ?) OR (scope_kind = 'group' AND scope_value = ?))`,
  )
    .bind(fellowship, pfccForFellowship(fellowship) ?? "", groupForFellowship(fellowship) ?? "")
    .all<{ owner: string }>();
  return (results ?? []).map((r) => r.owner);
}

/**
 * Someone changed fellowship: the leaders they've joined are told, and the
 * ones they've left (unless they lead both, e.g. the same group). Never throws.
 */
export async function movedFellowship(env: AppEnv, registrationId: string, from: string, m: { to: { title: string; body: string }; left: { title: string; body: string } }) {
  try {
    const r = await env.APP_DB.prepare("SELECT camp_id, fellowship FROM camp_registrations WHERE id = ?").bind(registrationId).first<{ camp_id: string; fellowship: string }>();
    if (!r) return { joined: 0, left: 0 };
    const [now, before] = await Promise.all([leaderOwners(env, r.fellowship), leaderOwners(env, from)]);
    const gone = before.filter((o) => !now.includes(o));
    const [joined, left] = await Promise.all([
      now.length ? pushToOwners(env, now, "registration", { ...m.to, url: `/leaders/${r.camp_id}/people?person=${registrationId}`, tag: `leader-moved:${registrationId}` }) : 0,
      gone.length ? pushToOwners(env, gone, "registration", { ...m.left, url: `/leaders/${r.camp_id}/people`, tag: `leader-left:${registrationId}` }) : 0,
    ]);
    await toStaff(env, "registration", {
      title: "Fellowship changed",
      body: m.to.body,
      url: `/admin/camp/${r.camp_id}/people?person=${registrationId}`,
      lines: [
        ["Person", m.to.title.replace(/ joined .*$/, "")],
        ["From", from],
        ["To", r.fellowship],
      ],
    });
    return { joined, left };
  } catch (err) {
    console.error("notify moved", err);
    return { joined: 0, left: 0 };
  }
}

/**
 * A coordinator moved a payment from one person to another. Both are told:
 * a text if they have a number, the app notification either way. The leaders
 * of both fellowships (and their groups and PFCCs) get an app notification,
 * and the coordinators get the app notification and Telegram. Never throws.
 */
export async function paymentMoved(env: AppEnv, o: { from_id: string; to_id: string; reference: string; amount_pesewas: number; by: string }) {
  try {
    const [from, to] = await Promise.all([person(env, o.from_id), person(env, o.to_id)]);
    const fromFell = await env.APP_DB.prepare("SELECT fellowship FROM camp_registrations WHERE id = ?").bind(o.from_id).first<{ fellowship: string }>();
    const toFell = await env.APP_DB.prepare("SELECT fellowship FROM camp_registrations WHERE id = ?").bind(o.to_id).first<{ fellowship: string }>();
    if (!from || !to || !fromFell || !toFell) return;
    const amount = cedis(o.amount_pesewas);
    const outstanding = (x: PaidPerson) => Math.max(0, x.price_pesewas - x.paid_pesewas);
    const today = nowIso().slice(0, 10);

    const gets = async (id: string, x: PaidPerson, title: string, body: string, text: string, url: string) => {
      await toAttendee(env, id, "payment_received", { title, body, url });
      if (/^233\d{9}$/.test(x.phone) && today <= x.ends_on) {
        if (await sendSms(env, x.phone, text, "Commune")) await logCampSms(env, x.camp_id, "payment_moved", 1, smsParts(text));
      }
    };
    const receipt = receiptUrl(env, o.reference);
    await Promise.all([
      gets(
        o.to_id,
        to,
        "Your payment was moved to you",
        `Your ${amount} payment was on ${from.full_name}'s page by mistake. It's now on yours. Tap to see your receipt.`,
        `Hi ${firstName(to.full_name)}, your ${amount} payment for ${to.camp_name} was on ${from.full_name}'s page by mistake. We've moved it to yours. You've now paid ${cedis(to.paid_pesewas)} of ${cedis(to.price_pesewas)}. Receipt: ${receipt} - The Airport City Church`,
        `/camps/r/${encodeURIComponent(o.reference)}`,
      ),
      gets(
        o.from_id,
        from,
        "A payment was moved off your page",
        `The ${amount} on your page was ${to.full_name}'s payment, so we moved it to them. You have ${cedis(outstanding(from))} outstanding.`,
        `Hi ${firstName(from.full_name)}, the ${amount} on your page was ${to.full_name}'s payment, so we moved it to them. You still have ${cedis(outstanding(from))} outstanding for ${from.camp_name}. Pay here: ${communeOrigin(env)}/camps/${from.slug}/pay - The Airport City Church`,
        `/camps/${from.slug}/pay`,
      ),
    ]);

    const owners = [...new Set([...(await leaderOwners(env, fromFell.fellowship)), ...(await leaderOwners(env, toFell.fellowship))])];
    const body = `${amount} was moved from ${from.full_name} to ${to.full_name}.`;
    const leaders = owners.length ? await pushToOwners(env, owners, "payment", { title: "A payment was moved", body, url: `/leaders/${from.camp_id}/people?person=${o.to_id}`, tag: `leader-pay-moved:${o.reference}` }) : 0;
    await toStaff(env, "payment", {
      title: "A payment was moved",
      body,
      url: `/admin/camp/${from.camp_id}/people?person=${o.to_id}`,
      lines: [
        ["Amount", amount],
        ["From", `${from.full_name} (${fromFell.fellowship}) · ${cedis(outstanding(from))} outstanding now`],
        ["To", `${to.full_name} (${toFell.fellowship}) · ${to.status === "fully_paid" ? "fully paid" : `${cedis(outstanding(to))} outstanding`}`],
        ["Moved by", payerWords(o.by)],
        ["Camp", from.camp_name],
        ["Receipt no.", o.reference],
      ],
    });
    return { leaders };
  } catch (err) {
    console.error("notify payment moved", err);
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
  const group = paidBy.match(/^leader:group:([^:]+):(.+)$/);
  if (group) return `${group[2]} (${group[1]} leader)`;
  const leader = paidBy.match(/^leader:(?:fellowship|pfcc|group):(.+)$/);
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
  /** That payment was the Pastor's. */
  byPastor?: boolean;
  fullyPaidFirstTime: boolean;
  roommatesBy: string | null;
}) {
  const what = o.byPastor
    ? `Pastor has paid ${cedis(o.amount)} towards your room at ${o.camp}.`
    : o.bulk
    ? `your balance of ${cedis(o.amount)} for ${o.camp} has been paid for you${o.bulk.note ? ` (${o.bulk.note})` : ""}.`
    : o.payer
      ? `${o.payer} has paid ${cedis(o.amount)} towards your room at ${o.camp}.`
      : `we've received your payment of ${cedis(o.amount)} for ${o.camp}.`;
  const then = o.left > 0
    ? ` You have ${cedis(o.left)} left to pay.`
    : o.fullyPaidFirstTime
      ? ` Your room is now fully paid for. Thank you!${o.roommatesBy ? ` Next, choose your roommates in Commune by ${o.roommatesBy}.` : ""}`
      : " Your room is fully paid for.";
  return `Hi ${o.first}, ${what}${then} Receipt: ${o.receipt} - The Airport City Church`;
}

/** Whether a staff email is the Pastor's (camp_staff role 'pastor'). */
async function isPastor(env: AppEnv, email: string | null | undefined) {
  if (!email) return false;
  const row = await env.APP_DB.prepare("SELECT 1 AS yes FROM camp_staff WHERE email = ? AND role = 'pastor'").bind(email).first<{ yes: number }>();
  return !!row;
}

/**
 * A payment went through: the receipt text and app notification to the
 * attendee (once per payment). When they pay themselves, the text only goes
 * if no phone got the notification. When someone else pays, they get both.
 * Unless it's a share of a coordinator's payment, coordinators get an update.
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
      // "Your room is now fully paid for" is said once per person, even across a refund and a second payment.
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
      const roommatesBy = full && fullClaim && today <= r.roommate_deadline_on ? shortDay(r.roommate_deadline_on) : null;
      // Paid by the Pastor: they're told so by name, in the app and by text.
      const byPastor = p.bulk_id
        ? await isPastor(env, (await env.APP_DB.prepare("SELECT paid_by FROM camp_bulk_payments WHERE id = ?").bind(p.bulk_id).first<{ paid_by: string }>())?.paid_by)
        : false;
      // App first when they pay themselves: the notification is free, the text
      // only goes if no phone got it. When someone else pays, they get both.
      const paidForThem = !!(p.bulk_id || payer);
      const from = byPastor ? `Pastor has paid ${cedis(p.amount_pesewas)} for you` : p.bulk_id ? "Your camp balance was paid for you" : payer ? `${payer} paid ${cedis(p.amount_pesewas)} for you` : `We received ${cedis(p.amount_pesewas)}`;
      const pushed = await toAttendee(env, p.registration_id, "payment_received", {
        title: full ? "Your room is fully paid for 🎉" : "Payment received",
        body: full
          ? `${from}. You're all set for ${r.camp_name}.${roommatesBy ? ` Next, choose your roommates by ${roommatesBy}.` : ""} Tap to see your receipt.`
          : `${from}. You have ${cedis(left)} left to pay by ${shortDay(r.payment_due_on)}. Tap to see your receipt.`,
        url: `/camps/r/${encodeURIComponent(p.reference)}`,
      });
      if ((!pushed || paidForThem) && /^233\d{9}$/.test(r.phone) && today <= r.ends_on) {
        const text = receiptText({
          first: firstName(r.full_name),
          camp: r.camp_name,
          amount: p.amount_pesewas,
          left,
          receipt,
          payer,
          bulk: p.bulk_id ? (bulk ?? { note: null }) : null,
          byPastor,
          fullyPaidFirstTime: fullClaim,
          roommatesBy: today <= r.roommate_deadline_on ? shortDay(r.roommate_deadline_on) : null,
        });
        if (await sendSms(env, r.phone, text, "Commune")) await logCampSms(env, r.camp_id, "receipt", 1, smsParts(text));
      }
    }

    if (!p.bulk_id) {
      await toLeaders(env, p.registration_id, "payment", {
        title: "Payment received",
        body: `${payer ? `${payer} paid for ${r.full_name}` : `${r.full_name} paid`} ${cedis(p.amount_pesewas)}. ${full ? "Now fully paid." : `${cedis(left)} left.`}`,
        url: (campId) => `/leaders/${campId}/people?person=${p.registration_id}`,
      });
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
  const who = (await isPastor(env, b.paid_by)) ? "Pastor" : payerWords(b.paid_by);
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

const OWNER = /^(attendee:[0-9a-f-]{36}|leader:[0-9a-f-]{36}|staff:[^\s@]+@[^\s@]+\.[^\s@]+)$/i;
const ALL_KINDS: string[] = [...ATTENDEE_KINDS, "registration", "payment", "payment_problem", "request", "cancellation"];

/** Events that happen on the Next side: registration, requests, cancellations, rooms. */
export async function notifyEndpoint(request: Request, env: AppEnv) {
  const b = await readJson<{ to?: unknown; kind?: unknown; registration_id?: unknown; from_fellowship?: unknown; from_id?: unknown; to_id?: unknown; reference?: unknown; amount_pesewas?: unknown; by?: unknown; left_title?: unknown; left_body?: unknown; owners?: unknown; title?: unknown; body?: unknown; url?: unknown; lines?: unknown }>(request);
  const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const lines: Line[] = Array.isArray(b.lines)
    ? b.lines.slice(0, 14).map((l) => (typeof l === "string" ? text(l, 40) : Array.isArray(l) ? ([text(l[0], 40), text(l[1], 300)] as const) : null))
    : [];
  const m = { title: text(b.title, 80), body: text(b.body, 300), url: text(b.url, 300) || "/camps", lines };
  if (!m.title || !m.body || !m.url.startsWith("/")) throw new HttpError(400, "title, body and a relative url required");
  if (b.to === "staff" && (b.kind === "registration" || b.kind === "request" || b.kind === "cancellation")) {
    // Their leaders hear about their own people too (not cancellations).
    const leaders =
      (b.kind === "registration" || b.kind === "request") && typeof b.registration_id === "string" && UUID.test(b.registration_id)
        ? await toLeaders(env, b.registration_id, b.kind, { title: m.title, body: m.body, url: (campId) => `/leaders/${campId}/people?person=${b.registration_id}` })
        : 0;
    return json({ ...(await toStaff(env, b.kind, m)), leaders });
  }
  if (b.to === "moves" && b.kind === "payment_moved" && typeof b.from_id === "string" && UUID.test(b.from_id) && typeof b.to_id === "string" && UUID.test(b.to_id) && typeof b.reference === "string" && Number.isInteger(b.amount_pesewas)) {
    await paymentMoved(env, { from_id: b.from_id, to_id: b.to_id, reference: text(b.reference, 80), amount_pesewas: b.amount_pesewas as number, by: text(b.by, 120) });
    return json({ ok: true });
  }
  if (b.to === "leaders" && b.kind === "moved" && typeof b.registration_id === "string" && UUID.test(b.registration_id) && typeof b.from_fellowship === "string") {
    const left = { title: text(b.left_title, 80) || m.title, body: text(b.left_body, 300) || m.body };
    return json(await movedFellowship(env, b.registration_id, text(b.from_fellowship, 80), { to: { title: m.title, body: m.body }, left }));
  }
  if (b.to === "leaders" && b.kind === "messages" && Array.isArray(b.owners)) {
    // A coordinator's message to the leaders: app notifications only (leaders share a code, so there's no phone to text).
    const owners = b.owners.filter((o): o is string => typeof o === "string" && /^leader:[0-9a-f-]{36}$/i.test(o)).slice(0, 500);
    if (!owners.length) return json({ push: 0 });
    return json({ push: await pushTo(env, owners.map(() => "?").join(","), owners, "messages", { title: m.title, body: m.body, url: m.url, tag: `messages:${Date.now()}` }) });
  }
  if (b.to === "attendee" && typeof b.registration_id === "string" && UUID.test(b.registration_id) && (b.kind === "room_ready" || b.kind === "request_answered")) {
    return json({ push: await toAttendee(env, b.registration_id, b.kind, { title: m.title, body: m.body, url: m.url }) });
  }
  throw new HttpError(400, "unknown notification");
}

const MANY_KINDS = new Set<string>(["room_ready", "request_answered", "messages", "due_soon"]);

/**
 * App notifications to many attendees at once, each with its own words
 * (rooms, the thank-you, a coordinator's message, a leader's reminder).
 * Answers which registrations got it on at least one phone, so the Next side
 * texts only the rest. `once`: a key that makes a repeat (the same day's
 * reminder) a no-op.
 */
export async function notifyManyEndpoint(request: Request, env: AppEnv) {
  const b = await readJson<{ items?: unknown }>(request, 2 * 1024 * 1024);
  if (!Array.isArray(b.items) || b.items.length > 1000) throw new HttpError(400, "items required (at most 1000)");
  const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const items = b.items.map((raw) => {
    const i = (raw ?? {}) as Record<string, unknown>;
    const it = { id: text(i.registration_id, 36), kind: text(i.kind, 40), title: text(i.title, 80), body: text(i.body, 300), url: text(i.url, 300), once: text(i.once, 120) };
    if (!UUID.test(it.id) || !MANY_KINDS.has(it.kind) || !it.title || !it.body || !it.url.startsWith("/")) throw new HttpError(400, "each item needs a registration, a kind, words and a relative url");
    return it;
  });
  const delivered: string[] = [];
  const skipped: string[] = [];
  for (let i = 0; i < items.length; i += 25) {
    await Promise.all(
      items.slice(i, i + 25).map(async (it) => {
        if (it.once && !(await once(env, it.once))) return void skipped.push(it.id);
        const n = await toAttendee(env, it.id, it.kind as AttendeeKind, { title: it.title, body: it.body, url: it.url });
        if (n > 0) delivered.push(it.id);
      }),
    );
  }
  return json({ delivered, skipped });
}

/** A phone turning notifications on (or off: endpoint with remove). Push services are https; 127.0.0.1 is the tests' fake. */
export async function pushSubscribe(request: Request, env: AppEnv) {
  const b = await readJson<{ owner?: unknown; endpoint?: unknown; p256dh?: unknown; auth?: unknown; remove?: unknown; keep?: unknown }>(request);
  const endpoint = typeof b.endpoint === "string" && /^(https:\/\/|http:\/\/127\.0\.0\.1:\d+\/)/.test(b.endpoint) && b.endpoint.length < 1000 ? b.endpoint : null;
  if (!endpoint) throw new HttpError(400, "endpoint required");
  const owner = typeof b.owner === "string" && OWNER.test(b.owner) ? b.owner.toLowerCase() : null;
  if (b.remove === true) {
    // Turning notifications off in one app leaves the other app on the same phone alone.
    if (owner) await env.APP_DB.prepare("DELETE FROM camp_push_subs WHERE endpoint = ? AND owner = ?").bind(endpoint, owner).run();
    else await env.APP_DB.prepare("DELETE FROM camp_push_subs WHERE endpoint = ?").bind(endpoint).run();
    return json({ ok: true });
  }
  const key = (v: unknown) => (typeof v === "string" && /^[A-Za-z0-9_-]{16,200}$/.test(v) ? v : null);
  const p256dh = key(b.p256dh);
  const auth = key(b.auth);
  if (!owner || !p256dh || !auth) throw new HttpError(400, "owner and keys required");
  // One phone can be an attendee's and a team member's (Android shares one address between the two
  // Home Screen icons). On each side it belongs to whoever turned notifications on there last.
  const team = !owner.startsWith("attendee:");
  // `keep`: the other leader codes signed in on this phone, which keep getting notifications here too.
  const keep = team && Array.isArray(b.keep) ? b.keep.filter((k): k is string => typeof k === "string" && /^leader:[0-9a-f-]{36}$/i.test(k)).slice(0, 8) : [];
  await env.APP_DB.batch([
    env.APP_DB.prepare(
      `DELETE FROM camp_push_subs WHERE endpoint = ? AND owner <> ? AND ${team ? "(owner LIKE 'staff:%' OR owner LIKE 'leader:%')" : "owner LIKE 'attendee:%'"}${keep.length ? ` AND owner NOT IN (${keep.map(() => "?").join(",")})` : ""}`,
    ).bind(endpoint, owner, ...keep),
    env.APP_DB.prepare(
      `INSERT INTO camp_push_subs (endpoint, p256dh, auth, owner) VALUES (?, ?, ?, ?)
       ON CONFLICT (endpoint, owner) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth, fails = 0`,
    ).bind(endpoint, p256dh, auth, owner),
    // Keys belong to the phone, so every owner's copy gets the new ones.
    env.APP_DB.prepare("UPDATE camp_push_subs SET p256dh = ?, auth = ? WHERE endpoint = ?").bind(p256dh, auth, endpoint),
  ]);
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
