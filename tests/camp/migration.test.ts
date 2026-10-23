import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { WORKER_DIR } from "../setup/constants";
import { applyMigrations } from "../setup/worker";

// The down file must undo 0004 cleanly so the migration can apply again.
// Uses its own throwaway database, not the one the other tests share.

const dir = mkdtempSync(join(tmpdir(), "camp-migration-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const tables = () => {
  const out = execFileSync(
    "npx",
    [
      "wrangler", "d1", "execute", "tacc", "--local", "--persist-to", dir, "--json",
      "--command", "SELECT name FROM sqlite_master WHERE type = 'table' AND (name = 'camps' OR name LIKE 'camp\\_%' ESCAPE '\\') ORDER BY name",
    ],
    { cwd: WORKER_DIR, env: { ...process.env, CI: "1" } },
  ).toString();
  return (JSON.parse(out)[0].results as { name: string }[]).map((r) => r.name);
};

describe("0004_camp_foundation", () => {
  it("applies, rolls back and re-applies", { timeout: 120_000 }, () => {
    const expected = ["camp_audit_log", "camp_room_types", "camp_rooms", "camp_staff", "camps"];
    applyMigrations(dir);
    expect(tables()).toEqual(expected);

    execFileSync(
      "npx",
      ["wrangler", "d1", "execute", "tacc", "--local", "--persist-to", dir, "--file", "migrations-tacc/down/0004_camp_foundation.down.sql"],
      { cwd: WORKER_DIR, stdio: "pipe", env: { ...process.env, CI: "1" } },
    );
    expect(tables()).toEqual([]);

    applyMigrations(dir);
    expect(tables()).toEqual(expected);
  });
});
