import { execFile } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, describe, expect, it } from "vitest";
import { WORKER_DIR } from "../setup/constants";

// The down files must undo 0018 back to 0004 cleanly so all can apply again.
// Uses its own throwaway database, not the one the other tests share.

const dir = mkdtempSync(join(tmpdir(), "camp-migration-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

// Async, so the test worker isn't blocked while wrangler runs.
const run = promisify(execFile);
const wrangler = async (...args: string[]) =>
  (
    await run("npx", ["wrangler", "d1", ...args, "--local", "--persist-to", dir], {
      cwd: WORKER_DIR,
      env: { ...process.env, CI: "1" },
    })
  ).stdout;

const apply = () => wrangler("migrations", "apply", "tacc");
const down = (name: string) => wrangler("execute", "tacc", "--file", `migrations-tacc/down/${name}.down.sql`);
const tables = async () => {
  const out = await wrangler(
    "execute", "tacc", "--json",
    "--command", "SELECT name FROM sqlite_master WHERE type = 'table' AND (name = 'camps' OR name LIKE 'camp\\_%' ESCAPE '\\') ORDER BY name",
  );
  return (JSON.parse(out)[0].results as { name: string }[]).map((r) => r.name);
};

describe("camp migrations", () => {
  it("apply, roll back and re-apply", { timeout: 180_000 }, async () => {
    const foundation = ["camp_audit_log", "camp_room_types", "camp_rooms", "camp_staff", "camps"];
    const registrations = [...foundation, "camp_payments", "camp_rate_limits", "camp_registrations"].sort();
    const groups = [...registrations, "camp_group_invites", "camp_group_members", "camp_groups"].sort();
    const assignments = [...groups, "camp_room_assignments"].sort();
    const refunds = [...assignments, "camp_refunds", "camp_room_sms"].sort();
    const places = [...refunds, "camp_room_type_places"].sort();
    const v2 = [...places, "camp_bulk_payments", "camp_daily_summaries", "camp_requests", "camp_saved_views"].sort();
    const leaders = [...v2, "camp_leader_codes"].sort();
    const feedback = [...leaders, "camp_feedback", "camp_feedback_invites"].sort();
    const expected = [...feedback, "camp_scan_counts"].sort();
    await apply();
    expect(await tables()).toEqual(expected);

    await down("0018_camp_cheaper_reads");
    expect(await tables()).toEqual(feedback);
    await down("0017_camp_groups_link_only");
    expect(await tables()).toEqual(feedback);
    await down("0016_camp_gender_change");
    expect(await tables()).toEqual(feedback);
    await down("0015_camp_shirt_rule");
    expect(await tables()).toEqual(feedback);
    await down("0014_camp_feedback");
    expect(await tables()).toEqual(leaders);
    await down("0013_camp_checkout_url");
    expect(await tables()).toEqual(leaders);
    await down("0012_camp_leader_codes");
    expect(await tables()).toEqual(v2);

    await down("0011_camp_v2");
    expect(await tables()).toEqual(places);

    await down("0010_camp_photos");
    expect(await tables()).toEqual(places);
    await down("0009_camp_places_left");
    expect(await tables()).toEqual(refunds);
    await down("0008_camp_refunds");
    expect(await tables()).toEqual(assignments);
    await down("0007_camp_room_assignments");
    expect(await tables()).toEqual(groups);
    await down("0006_camp_groups");
    expect(await tables()).toEqual(registrations);
    await down("0005_camp_registrations");
    expect(await tables()).toEqual(foundation);
    await down("0004_camp_foundation");
    expect(await tables()).toEqual([]);

    await apply();
    expect(await tables()).toEqual(expected);
  });
});
