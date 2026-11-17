import { headers } from "next/headers";
import { leaderName } from "@/lib/camp/leaders";
import { mustSetUpTeamApp, teamInfo, teamOwner } from "@/lib/camp/team-app";
import type { Staff } from "@/lib/camp/types";
import { AppGate, AppTracker } from "@/components/camp/notifications/AppGate";
import { staffNotifyPrefsAction, staffPushRemoveAction, staffPushSubscribeAction, teamInstalledAction } from "./actions";

const WHY = {
  coordinator: "hear about registrations, payments and requests as they happen",
  leader: "hear when your people register, pay or ask for something, and get messages from the coordinators",
};

/**
 * Commune Team, for coordinators and leaders: on a phone, the camp's pages
 * open once Commune Team is on the Home Screen with notifications on. No way
 * past on a phone; computers aren't asked. Returns the set-up screen, or
 * null to show the page (with the install tracker).
 */
export async function teamGate(staff: Staff, campName: string) {
  const owner = teamOwner(staff);
  const [info, h] = await Promise.all([teamInfo(owner), headers()]);
  const tracker = <AppTracker known={info.installed} installed={teamInstalledAction} kind="team" />;
  if (!mustSetUpTeamApp(info, h.get("user-agent") ?? "")) return { tracker, gate: null };
  const leader = staff.role === "leader";
  const name = leader ? (staff.scope_value ?? "Leader") : (leaderName(staff.email) ?? staff.email.split("@")[0]);
  return {
    tracker,
    gate: (
      <div className="mx-auto max-w-xl px-5 py-6">
        <AppGate
          variant="team"
          why={WHY[leader ? "leader" : "coordinator"]}
          startUrl={null}
          first={name}
          campName={campName}
          serverInstalled={info.installed}
          serverPush={info.push}
          actions={{ save: staffPushSubscribeAction, remove: staffPushRemoveAction, prefs: staffNotifyPrefsAction }}
        />
      </div>
    ),
  };
}
