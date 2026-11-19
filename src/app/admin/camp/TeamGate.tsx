import { cookies, headers } from "next/headers";
import { leaderName } from "@/lib/camp/leaders";
import { mustSetUpTeamApp, teamInfo, teamOwner } from "@/lib/camp/team-app";
import type { Staff } from "@/lib/camp/types";
import { AppGate, AppTracker } from "@/components/camp/notifications/AppGate";
import { IPadMark } from "@/components/camp/notifications/IPadMark";
import { IPAD_COOKIE, TEAM_NO_APP_COOKIE, agentFor, tooOldForAppNotifications } from "@/lib/camp/ipad";
import { staffNotifyPrefsAction, staffPushRemoveAction, staffPushSubscribeAction, teamInstalledAction, teamNoAppAction } from "./actions";

const WHY = {
  coordinator: "hear about registrations, payments and requests as they happen",
  leader: "hear when your people register, pay or ask for something, and get messages from the coordinators",
};

/**
 * Commune Team, for coordinators and leaders: on a phone, the camp's pages
 * open once Commune Team is on the Home Screen with notifications on. No way
 * past on a phone, except a device too old for app notifications ("My
 * device can't do this"); computers aren't asked. Returns the set-up screen, or
 * null to show the page (with the install tracker).
 */
export async function teamGate(staff: Staff, campName: string) {
  const owner = teamOwner(staff);
  const [info, h] = await Promise.all([teamInfo(owner), headers()]);
  const tracker = (
    <>
      <AppTracker known={info.installed} installed={teamInstalledAction} kind="team" />
      <IPadMark />
    </>
  );
  // iPads say they're Macs: IPadMark's cookie tells us, so they're asked to install too.
  const jar = await cookies();
  const agent = agentFor(h.get("user-agent") ?? "", jar.get(IPAD_COOKIE)?.value);
  // "My device can't do this": this device was let through.
  if (jar.get(TEAM_NO_APP_COOKIE)?.value === "1" || !mustSetUpTeamApp(info, agent)) return { tracker, gate: null };
  const leader = staff.role === "leader";
  // A Group Leader's code carries their name: greet them by it.
  const holder = staff.scope_kind === "group" ? staff.email.split(":").slice(3).join(":").split(" ")[0] : "";
  const name = staff.role === "pastor" ? "Pastor" : leader ? holder || (staff.scope_value ?? "Leader") : (leaderName(staff.email) ?? staff.email.split("@")[0]);
  return {
    tracker,
    gate: (
      <div className="mx-auto max-w-xl px-5 py-6">
        <AppGate
          app={{ kind: "team", name: "Commune Team", icon: "/commune/team-icon-192.png" }}
          why={WHY[leader ? "leader" : "coordinator"]}
          startUrl={null}
          first={name}
          campName={campName}
          serverInstalled={info.installed}
          serverPush={info.push}
          actions={{ save: staffPushSubscribeAction, remove: staffPushRemoveAction, prefs: staffNotifyPrefsAction }}
          noApp={{ run: teamNoAppAction, tooOld: tooOldForAppNotifications(agent) }}
        />
      </div>
    ),
  };
}
