import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TEST_ADMIN_SECRET, TEST_WORKER_PORT, TEST_WORKER_URL, WORKER_DIR } from "./constants";

/**
 * Starts the soulwinning Worker locally on a fresh D1 with every tacc
 * migration applied, so database tests exercise the same SQL path as
 * production. Nothing remote is touched: --local only, temp persistence.
 */

export function applyMigrations(persistTo: string) {
  execFileSync("npx", ["wrangler", "d1", "migrations", "apply", "tacc", "--local", "--persist-to", persistTo], {
    cwd: WORKER_DIR,
    stdio: "pipe",
    env: { ...process.env, CI: "1" },
  });
}

async function waitForWorker(child: ReturnType<typeof spawn>, log: () => string) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`wrangler dev exited early:\n${log()}`);
    try {
      if ((await fetch(`${TEST_WORKER_URL}/`)).ok) return;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`wrangler dev didn't start in time:\n${log()}`);
}

export default async function setup() {
  const dir = mkdtempSync(join(tmpdir(), "camp-d1-"));
  const envFile = join(dir, "test.env");
  writeFileSync(envFile, `ADMIN_SECRET=${TEST_ADMIN_SECRET}\n`);
  applyMigrations(dir);

  let output = "";
  const child = spawn(
    "npx",
    [
      "wrangler", "dev", "--local",
      "--ip", "127.0.0.1",
      "--port", String(TEST_WORKER_PORT),
      "--persist-to", dir,
      "--env-file", envFile,
      "--show-interactive-dev-session=false",
      "--log-level", "warn",
    ],
    { cwd: WORKER_DIR, detached: true, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, CI: "1" } },
  );
  child.stdout?.on("data", (d) => (output += d));
  child.stderr?.on("data", (d) => (output += d));

  try {
    await waitForWorker(child, () => output);
  } catch (err) {
    if (child.pid) process.kill(-child.pid, "SIGTERM");
    throw err;
  }

  return () => {
    // detached: kill the whole group, including workerd.
    if (child.pid) process.kill(-child.pid, "SIGTERM");
    rmSync(dir, { recursive: true, force: true });
  };
}
