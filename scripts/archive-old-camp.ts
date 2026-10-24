/**
 * One-off archive of the retired camp feature's Supabase data (Phase 6).
 * Reads every row of the old tables and the camp-logos file list with the
 * service-role key and writes JSON to a folder OUTSIDE the repo. Read-only:
 * nothing is changed or deleted, and phones stay exactly as stored (nothing
 * is decrypted).
 *
 *   node --experimental-strip-types --env-file=.env.local scripts/archive-old-camp.ts ~/tacc-archive/old-camp-YYYY-MM-DD
 *
 * The output holds personal data (names, encrypted phones): keep it private.
 * Schema for reading it: docs/camp/archive/old-camp-schema.sql.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const TABLES = ["camps", "camp_admins", "attendees", "rooms", "groups"];
const BUCKET = "camp-logos";
const PAGE = 1000;

const outDir = path.resolve(process.argv[2] ?? "");
const repo = path.resolve(import.meta.dirname, "..");
if (!process.argv[2]) throw new Error("Give an output folder outside the repo.");
if (outDir === repo || outDir.startsWith(`${repo}${path.sep}`)) throw new Error("The archive must not be written inside the repo.");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
const supabase = createClient(url, key, { auth: { persistSession: false } });

async function allRows(table: string) {
  const rows: unknown[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(table).select("*").range(from, from + PAGE - 1);
    if (error) return { rows, error: error.message };
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return { rows, error: null };
  }
}

async function bucketFiles(prefix = ""): Promise<{ name: string; size: number | null; updated_at: string | null }[]> {
  const { data, error } = await supabase.storage.from(BUCKET).list(prefix, { limit: 1000 });
  if (error) throw new Error(`${BUCKET}: ${error.message}`);
  const files = [];
  for (const item of data ?? []) {
    const name = prefix ? `${prefix}/${item.name}` : item.name;
    // Folders have no id.
    if (!item.id) files.push(...(await bucketFiles(name)));
    else files.push({ name, size: item.metadata?.size ?? null, updated_at: item.updated_at ?? null });
  }
  return files;
}

mkdirSync(outDir, { recursive: true, mode: 0o700 });
const summary: Record<string, unknown> = { exported_at: new Date().toISOString(), source: new URL(url).host, tables: {} };

for (const table of TABLES) {
  const { rows, error } = await allRows(table);
  writeFileSync(path.join(outDir, `${table}.json`), JSON.stringify(rows, null, 2), { mode: 0o600 });
  (summary.tables as Record<string, unknown>)[table] = error ? { rows: rows.length, error } : { rows: rows.length };
  console.log(`${table}: ${rows.length} rows${error ? ` (error: ${error})` : ""}`);
}

try {
  const files = await bucketFiles();
  writeFileSync(path.join(outDir, `${BUCKET}.json`), JSON.stringify(files, null, 2), { mode: 0o600 });
  summary[BUCKET] = { files: files.length, public_url_prefix: `${url}/storage/v1/object/public/${BUCKET}/` };
  console.log(`${BUCKET}: ${files.length} files (listed, left in place)`);
} catch (err) {
  summary[BUCKET] = { error: (err as Error).message };
  console.log(`${BUCKET}: ${(err as Error).message}`);
}

writeFileSync(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2), { mode: 0o600 });
console.log(`Written to ${outDir}`);
