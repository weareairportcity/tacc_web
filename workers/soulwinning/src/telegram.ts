import { summaries } from "./camp-summary";
import { HttpError, json, readJson, timingSafeEqual, type AppEnv } from "./util";

/**
 * The coordinators' Telegram bot.
 *
 * Setup: create the bot with @BotFather, set TELEGRAM_BOT_TOKEN,
 * TELEGRAM_WEBHOOK_SECRET and TELEGRAM_LINK_CODE as Worker secrets, then call
 * /v1/admin/telegram/setup once. In the coordinators' group someone sends
 * "/link <code>": that group gets the messages and that person alone can
 * change /settings (on/off buttons for each kind of message).
 */

export type TgKind = "registration" | "payment" | "payment_problem" | "request" | "cancellation" | "daily";

/** What the group can turn on and off, in the order /settings shows them. */
export const TG_KINDS: { kind: TgKind; label: string }[] = [
  { kind: "registration", label: "New registrations" },
  { kind: "payment", label: "Payments received" },
  { kind: "payment_problem", label: "Payments that need a look" },
  { kind: "request", label: "Refund and room requests" },
  { kind: "cancellation", label: "Cancellations" },
  { kind: "daily", label: "Evening summary (7 pm)" },
];

type Chat = { chat_id: string; title: string; owner_user_id: string; owner_name: string; off_json: string };

export const telegramConfigured = (env: AppEnv) => Boolean(env.TELEGRAM_BOT_TOKEN);

async function api<T = unknown>(env: AppEnv, method: string, body: unknown): Promise<T | null> {
  if (!env.TELEGRAM_BOT_TOKEN) return null;
  try {
    const res = await fetch(`${env.TELEGRAM_API_URL || "https://api.telegram.org"}/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    const data = (await res.json().catch(() => null)) as { ok?: boolean; result?: T; description?: string } | null;
    if (!data?.ok) {
      console.error("telegram", method, data?.description ?? res.status);
      return null;
    }
    return data.result ?? null;
  } catch (err) {
    console.error("telegram", method, err);
    return null;
  }
}

const offOf = (chat: Pick<Chat, "off_json">): string[] => {
  try {
    const v = JSON.parse(chat.off_json);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
};

/** Text for Telegram's HTML mode: names and notes can't break the formatting. */
export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * A structured message: bold title, then one "Label: value" per line, so a
 * glance down the left side finds what you need.
 */
export function card(icon: string, title: string, lines: (readonly [string, string] | string | null | false | 0)[], footer?: string) {
  const out = [`${icon} <b>${esc(title)}</b>`, ""];
  for (const l of lines) {
    if (!l) continue;
    // A string is a section heading, with a gap above it.
    if (typeof l === "string") out.push(...(out.at(-1) === "" ? [] : [""]), `<b>${esc(l.toUpperCase())}</b>`);
    else if (l[1]) out.push(`${esc(l[0])}: <b>${esc(l[1])}</b>`);
  }
  if (footer) out.push("", `<i>${esc(footer)}</i>`);
  return out.join("\n");
}

/** Sends to every linked group that hasn't turned this kind off. `text` is Telegram HTML (see card). Never throws. */
export async function tellGroups(env: AppEnv, kind: TgKind, text: string) {
  if (!telegramConfigured(env)) return 0;
  try {
    const { results } = await env.APP_DB.prepare("SELECT * FROM camp_telegram_chats").all<Chat>();
    const chats = (results ?? []).filter((c) => !offOf(c).includes(kind));
    const sent = await Promise.all(chats.map((c) => api(env, "sendMessage", { chat_id: c.chat_id, text, parse_mode: "HTML", disable_web_page_preview: true })));
    return sent.filter(Boolean).length;
  } catch (err) {
    console.error("telegram send", err);
    return 0;
  }
}

function settingsKeyboard(off: string[]) {
  return {
    inline_keyboard: TG_KINDS.map((k) => [{ text: `${off.includes(k.kind) ? "🔕 Off" : "🔔 On"} · ${k.label}`, callback_data: `t:${k.kind}` }]),
  };
}

/** /test: one of each kind of update, with made-up people, so the group sees what to expect. */
const EXAMPLES = [
  "🧪 <b>Examples</b>\n\nHere is what each Commune update looks like. These are made up: nothing here needs action.",
  card("🙋", "New registration", [["Name", "Ama Mensah"], ["Gender", "Female"], ["Fellowship", "Qadash, PFCC 2"], ["Room type", "Hostel (GHS 600.00)"], ["Camp", "Example Camp"], ["Registered so far", "57"]]),
  card("💰", "Payment received", [["Attendee", "Ama Mensah"], ["Paid by", "Kwesi Mensah (pay link)"], ["Amount", "GHS 200 + GHS 5 fee"], ["Paid with", "Mobile money"], ["Balance", "GHS 400 left of GHS 600"], ["Room type", "Hostel"], ["Camp", "Example Camp"], ["Receipt no.", "CAMP-0000000000000001"]]),
  card("💰", "Payment received", [["Paid by", "Qadash leader"], ["For", "3 people"], ["People", "Abena Owusu, Kofi Mensah, Yaw Boateng"], ["Amount", "GHS 1,800 + GHS 45 fee"], ["Note", "Qadash fellowship fund"], ["Camp", "Example Camp"], ["Receipt no.", "CAMP-B000000000000001"]]),
  card("⚠️", "A payment needs a look", [["Attendee", "Ama Mensah"], ["What happened", "They paid after their balance was already covered, so the extra needs a refund."], ["Amount", "GHS 204"], ["Camp", "Example Camp"], ["What to do", "Open Money in Commune and sort it out."]]),
  card("📨", "New refund request", [["Attendee", "Ama Mensah"], ["Asking for", "GHS 200.00 back"], ["Paid so far", "GHS 600.00"], ["Reason", "I paid twice by mistake"], ["What to do", "Open Requests in Commune to decide."]]),
  card("📨", "New room change request", [["Attendee", "Kofi Mensah"], ["Wants to move", "from Hostel to Hotel"], ["Paid so far", "GHS 600.00"], ["Reason", "Travelling with my family"], ["What to do", "Open Requests in Commune to decide."]]),
  card("❌", "Registration cancelled", [["Attendee", "Efua Asante"], ["Room type", "Dorm"], ["Had paid", "GHS 200.00"], ["Refund", "A refund request is waiting in Requests."], ["Reason", "I can't come any more"]]),
  "Send /summary for where each camp stands right now.",
];

const HELP = [
  "I post Commune updates for the coordinators here.",
  "",
  "/summary: where each camp stands right now",
  "/settings: choose which updates come here",
  "/test: show an example of each update",
  "/unlink: stop posting here",
].join("\n");

type Update = {
  message?: { chat: { id: number; title?: string; type: string }; from?: { id: number; first_name?: string }; text?: string };
  callback_query?: { id: string; from: { id: number }; data?: string; message?: { chat: { id: number }; message_id: number } };
};

/** Telegram's webhook. Checked by the secret token Telegram sends with every call. */
export async function telegramHook(request: Request, env: AppEnv) {
  const given = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
  if (!env.TELEGRAM_WEBHOOK_SECRET || !timingSafeEqual(given, env.TELEGRAM_WEBHOOK_SECRET)) throw new HttpError(401, "unauthorized");
  const update = await readJson<Update>(request);

  if (update.callback_query) {
    const q = update.callback_query;
    const chatId = String(q.message?.chat.id ?? "");
    const chat = await env.APP_DB.prepare("SELECT * FROM camp_telegram_chats WHERE chat_id = ?").bind(chatId).first<Chat>();
    const kind = TG_KINDS.find((k) => `t:${k.kind}` === q.data)?.kind;
    if (!chat || !kind) {
      await api(env, "answerCallbackQuery", { callback_query_id: q.id });
      return json({ ok: true });
    }
    if (String(q.from.id) !== chat.owner_user_id) {
      await api(env, "answerCallbackQuery", { callback_query_id: q.id, text: `Only ${chat.owner_name || "the person who linked this group"} can change these.`, show_alert: true });
      return json({ ok: true });
    }
    const off = offOf(chat);
    const next = off.includes(kind) ? off.filter((k) => k !== kind) : [...off, kind];
    await env.APP_DB.prepare("UPDATE camp_telegram_chats SET off_json = ? WHERE chat_id = ?").bind(JSON.stringify(next), chatId).run();
    await api(env, "editMessageReplyMarkup", { chat_id: chatId, message_id: q.message!.message_id, reply_markup: settingsKeyboard(next) });
    await api(env, "answerCallbackQuery", { callback_query_id: q.id, text: next.includes(kind) ? "Turned off" : "Turned on" });
    return json({ ok: true });
  }

  const m = update.message;
  if (!m?.text || !m.text.startsWith("/")) return json({ ok: true });
  const [rawCommand, ...args] = m.text.trim().split(/\s+/);
  const command = rawCommand.split("@")[0].toLowerCase();
  const chatId = String(m.chat.id);
  const from = m.from ? String(m.from.id) : "";
  const say = (text: string, extra: Record<string, unknown> = {}) => api(env, "sendMessage", { chat_id: chatId, text, ...extra });
  const chat = await env.APP_DB.prepare("SELECT * FROM camp_telegram_chats WHERE chat_id = ?").bind(chatId).first<Chat>();

  switch (command) {
    case "/link": {
      const code = args[0] ?? "";
      if (!env.TELEGRAM_LINK_CODE || !from || !timingSafeEqual(code, env.TELEGRAM_LINK_CODE)) {
        await say("That code isn't right. Ask the Commune admin for the link code.");
        break;
      }
      await env.APP_DB.prepare(
        `INSERT INTO camp_telegram_chats (chat_id, title, owner_user_id, owner_name) VALUES (?, ?, ?, ?)
         ON CONFLICT (chat_id) DO UPDATE SET title = excluded.title, owner_user_id = excluded.owner_user_id, owner_name = excluded.owner_name`,
      )
        .bind(chatId, m.chat.title ?? "", from, m.from?.first_name ?? "")
        .run();
      // The code was posted in the chat: delete it so others in the group can't reuse it.
      await api(env, "deleteMessage", { chat_id: chatId, message_id: (update.message as { message_id?: number }).message_id });
      await say(`Linked! Commune updates will come here. ${m.from?.first_name ?? "You"} can choose which ones with /settings.`);
      break;
    }
    case "/settings":
      if (!chat) await say("This group isn't linked yet. Send /link followed by the code.");
      else if (from !== chat.owner_user_id) await say(`Only ${chat.owner_name || "the person who linked this group"} can change these.`);
      else await say("Tap to turn each kind of update on or off:", { reply_markup: settingsKeyboard(offOf(chat)) });
      break;
    case "/summary":
      if (!chat) await say("This group isn't linked yet. Send /link followed by the code.");
      else {
        const texts = await summaries(env);
        if (!texts.length) await say("No camp is open right now.");
        for (const text of texts) await say(text, { parse_mode: "HTML" });
      }
      break;
    case "/test":
      if (!chat) await say("This group isn't linked yet. Send /link followed by the code.");
      else for (const text of EXAMPLES) await say(text, { parse_mode: "HTML" });
      break;
    case "/unlink":
      if (chat && from === chat.owner_user_id) {
        await env.APP_DB.prepare("DELETE FROM camp_telegram_chats WHERE chat_id = ?").bind(chatId).run();
        await say("Done. No more Commune updates here.");
      } else if (chat) await say(`Only ${chat.owner_name || "the person who linked this group"} can unlink this group.`);
      break;
    default:
      await say(HELP);
  }
  return json({ ok: true });
}

/** Points Telegram at this Worker and sets the command menu. Run once after setting the secrets. */
export async function telegramSetup(env: AppEnv, origin: string) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_WEBHOOK_SECRET || !env.TELEGRAM_LINK_CODE) {
    throw new HttpError(400, "set TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET and TELEGRAM_LINK_CODE first");
  }
  const me = await api<{ username: string }>(env, "getMe", {});
  const hook = await api(env, "setWebhook", {
    url: `${origin}/v1/tg/hook`,
    secret_token: env.TELEGRAM_WEBHOOK_SECRET,
    allowed_updates: ["message", "callback_query"],
  });
  await api(env, "setMyCommands", {
    commands: [
      { command: "summary", description: "Where each camp stands right now" },
      { command: "settings", description: "Choose which updates come here" },
      { command: "test", description: "Show an example of each update" },
      { command: "unlink", description: "Stop posting here" },
    ],
  });
  return { bot: me?.username ?? null, webhook: Boolean(hook) };
}
