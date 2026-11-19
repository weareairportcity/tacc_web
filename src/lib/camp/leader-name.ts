/**
 * A leader's actor in the audit log (and as `paid_by`):
 *   leader:fellowship:Chosen          a fellowship's shared code
 *   leader:pfcc:PFCC 1                a PFCC's shared code
 *   leader:group:Group 1:Ama Mensah   a Group Leader's own code
 *   leader:medical:Medical team       the medical team's shared code
 * No server-only imports, so pages and the History can use it.
 */

/** The medical team's one shared code: its scope value and its name everywhere. */
export const MEDICAL_TEAM = "Medical team";

/** Names can't carry ':' (it separates the parts). */
export const cleanHolder = (name: string) => name.replace(/:/g, " ").trim().replace(/\s+/g, " ").slice(0, 80);

export const leaderActor = (kind: string, value: string, holder?: string | null) =>
  kind === "group" && holder ? `leader:group:${value}:${cleanHolder(holder)}` : `leader:${kind}:${value}`;

/** "leader:fellowship:Chosen" → "Chosen leader"; "leader:group:Group 1:Ama" → "Ama (Group 1 leader)"; null if it isn't a leader. */
export function leaderName(actor: string) {
  if (actor === `leader:medical:${MEDICAL_TEAM}`) return MEDICAL_TEAM;
  const g = actor.match(/^leader:group:([^:]+):(.+)$/);
  if (g) return `${g[2]} (${g[1]} leader)`;
  const m = actor.match(/^leader:(fellowship|pfcc|group):(.+)$/);
  return m ? `${m[2]} leader` : null;
}
