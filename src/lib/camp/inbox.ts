import { query } from "@/lib/cf";

/**
 * The Notifications page: every app notification sent to an owner, kept by
 * the Worker as it sends (camp_inbox, workers/soulwinning/src/notify.ts),
 * even when no phone of theirs got it. Owners: 'attendee:<id>',
 * 'staff:<email>', 'leader:<code id>' (a code's holders share it).
 */

export type InboxItem = { id: number; kind: string; title: string; body: string; url: string; created_at: string; read_at: string | null };

export function listInbox(owner: string, limit = 100) {
  return query<InboxItem>(
    "app",
    "SELECT id, kind, title, body, url, created_at, read_at FROM camp_inbox WHERE owner = ? ORDER BY created_at DESC, id DESC LIMIT ?",
    [owner, Math.min(200, Math.max(1, limit))],
  ).catch(() => [] as InboxItem[]);
}

/** Unread, for the bell (capped: the badge shows 99+). */
export async function unreadCount(owner: string) {
  const [row] = await query<{ n: number }>(
    "app",
    "SELECT COUNT(*) AS n FROM (SELECT 1 FROM camp_inbox WHERE owner = ? AND read_at IS NULL LIMIT 100)",
    [owner],
  ).catch(() => []);
  return row?.n ?? 0;
}

export async function markAllRead(owner: string) {
  await query("app", "UPDATE camp_inbox SET read_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE owner = ? AND read_at IS NULL", [owner]);
}
