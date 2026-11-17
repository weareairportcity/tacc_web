import { query } from "@/lib/cf";
import { isPhone } from "./app-first";
import { CampError, type Staff } from "./types";

/**
 * Commune Team: coordinators and leaders put their own app on the Home
 * Screen with notifications on. A coordinator is 'staff:<email>'; a leader
 * code (shared by a fellowship's or PFCC's leaders) is 'leader:<code id>'.
 */

export function teamOwner(staff: Staff) {
  if (staff.role !== "leader") return `staff:${staff.email}`;
  const codeId = (staff as Staff & { codeId?: string }).codeId;
  if (!codeId) throw new CampError("Please sign in again.");
  return `leader:${codeId}`;
}

export type TeamInfo = { installed: boolean; push: boolean };

export async function teamInfo(owner: string): Promise<TeamInfo> {
  const [row] = await query<{ installed: number; push: number }>(
    "app",
    `SELECT EXISTS (SELECT 1 FROM camp_team_app WHERE owner = ?1) AS installed, EXISTS (SELECT 1 FROM camp_push_subs WHERE owner = ?1) AS push`,
    [owner],
  );
  return { installed: !!row?.installed, push: !!row?.push };
}

const PLATFORMS = new Set(["ios", "android", "desktop"]);

export async function markTeamInstalled(owner: string, platform: string) {
  await query("app", "INSERT INTO camp_team_app (owner, platform) VALUES (?, ?) ON CONFLICT (owner) DO UPDATE SET platform = excluded.platform", [
    owner,
    PLATFORMS.has(platform) ? platform : "",
  ]);
}

/** On a phone, coordinators and leaders work in Commune Team with notifications on. Computers aren't asked. */
export const mustSetUpTeamApp = (info: TeamInfo, userAgent: string) => isPhone(userAgent) && !(info.installed && info.push);

export type TeamMember = { owner: string; name: string; role: "coordinator" | "leader"; installed_at: string | null; platform: string; push: number };

/** The App page's team list: coordinators by email, leader codes by fellowship or PFCC. */
export function listTeamApp() {
  return query<TeamMember>(
    "app",
    `SELECT o.owner, o.name, o.role, t.installed_at, COALESCE(t.platform, '') AS platform,
       EXISTS (SELECT 1 FROM camp_push_subs s WHERE s.owner = o.owner) AS push
     FROM (
       SELECT 'staff:' || email AS owner, email AS name, 'coordinator' AS role FROM camp_staff WHERE role IN ('admin', 'coordinator')
       UNION ALL
       SELECT 'leader:' || id, scope_value, 'leader' FROM camp_leader_codes WHERE revoked_at IS NULL
     ) o LEFT JOIN camp_team_app t ON t.owner = o.owner
     ORDER BY o.role, o.name COLLATE NOCASE`,
  );
}

/** Leader codes still in use, for a coordinator's message to the leaders. */
export async function leaderOwners() {
  return (await query<{ owner: string }>("app", "SELECT 'leader:' || id AS owner FROM camp_leader_codes WHERE revoked_at IS NULL")).map((r) => r.owner);
}
