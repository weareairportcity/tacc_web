import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_IDS = 500;
const CHUNK = 100;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Device-scoped delete. Members are not signed in, so the only proof we have
 * is the device_id stamped on the entrant when this phone first started
 * logging. Admins delete from the dashboard with their own RLS policy.
 */
export async function POST(request: Request) {
  let body: { ids?: unknown; device_id?: unknown };
  try {
    body = (await request.json()) as { ids?: unknown; device_id?: unknown };
  } catch {
    return NextResponse.json({ error: "ids required" }, { status: 400 });
  }

  const deviceId = typeof body.device_id === "string" ? body.device_id.trim() : "";
  const ids = Array.isArray(body.ids)
    ? [...new Set(body.ids.filter((id): id is string => typeof id === "string" && UUID.test(id)))]
    : [];

  if (!UUID.test(deviceId) || ids.length === 0 || ids.length > MAX_IDS) {
    return NextResponse.json({ error: "ids required" }, { status: 400 });
  }

  const found: { id: string; entrant_id: string; photo_path: string | null }[] = [];
  for (const batch of chunk(ids, CHUNK)) {
    const { data, error } = await supabaseAdmin
      .from("sw_soul_entries")
      .select("id, entrant_id, photo_path")
      .in("id", batch);
    if (error) {
      return NextResponse.json({ error: "lookup failed" }, { status: 500 });
    }
    found.push(...((data as typeof found) ?? []));
  }

  if (found.length === 0) {
    return NextResponse.json({ deleted: 0 }, { headers: { "Cache-Control": "no-store" } });
  }

  const entrantIds = [...new Set(found.map((row) => row.entrant_id))];
  const { data: entrants, error: entrantError } = await supabaseAdmin
    .from("sw_entrants")
    .select("id, device_id")
    .in("id", entrantIds);
  if (entrantError) {
    return NextResponse.json({ error: "lookup failed" }, { status: 500 });
  }

  const deviceByEntrant = new Map(
    ((entrants as { id: string; device_id: string }[]) ?? []).map((row) => [row.id, row.device_id])
  );
  if (found.some((row) => deviceByEntrant.get(row.entrant_id) !== deviceId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const deleteIds = found.map((row) => row.id);
  const paths = found.map((row) => row.photo_path).filter((path): path is string => Boolean(path));

  for (const batch of chunk(deleteIds, CHUNK)) {
    const { error } = await supabaseAdmin
      .from("sw_soul_entries")
      .update({ duplicate_of: null })
      .in("duplicate_of", batch);
    if (error) {
      return NextResponse.json({ error: "could not unlink" }, { status: 500 });
    }
  }

  for (const batch of chunk(deleteIds, CHUNK)) {
    const { error } = await supabaseAdmin.from("sw_soul_entries").delete().in("id", batch);
    if (error) {
      return NextResponse.json({ error: "could not delete" }, { status: 500 });
    }
  }

  for (let i = 0; i < paths.length; i += CHUNK) {
    await supabaseAdmin.storage.from("sw-photos").remove(paths.slice(i, i + CHUNK));
  }

  return NextResponse.json(
    { deleted: deleteIds.length },
    { headers: { "Cache-Control": "no-store" } }
  );
}
