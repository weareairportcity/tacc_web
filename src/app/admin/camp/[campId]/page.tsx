import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BedDouble } from "lucide-react";
import { query } from "@/lib/cf";
import type { AuditEntry } from "@/lib/camp/audit";
import { getCamp, ID } from "@/lib/camp/camps";
import { listRoomTypes } from "@/lib/camp/rooms";
import { NoAccess, pageStaff } from "../access";
import { CampForm } from "../CampForm";
import { Card, STATUS_STYLES, secondaryButtonClass } from "../ui";
import { RoomTypes } from "./RoomTypes";

export default async function CampPage({ params }: { params: Promise<{ campId: string }> }) {
  const staff = await pageStaff("coordinator");
  if (!staff) return <NoAccess />;
  const { campId } = await params;
  if (!ID.test(campId)) notFound();

  const [camp, roomTypes, [{ rooms }], activity] = await Promise.all([
    getCamp(campId),
    listRoomTypes(campId),
    query<{ rooms: number }>("app", "SELECT count(*) AS rooms FROM camp_rooms WHERE camp_id = ?", [campId]),
    query<AuditEntry>(
      "app",
      "SELECT id, created_at, actor, action, entity, entity_id FROM camp_audit_log WHERE camp_id = ? ORDER BY id DESC LIMIT 15",
      [campId],
    ),
  ]);
  if (!camp) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/camp" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" /> Camps
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{camp.name}</h1>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[camp.status]}`}>
              {camp.status}
            </span>
          </div>
          <Link href={`/admin/camp/${camp.id}/rooms`} className={secondaryButtonClass}>
            <BedDouble className="h-4 w-4" /> Rooms ({rooms})
          </Link>
        </div>
      </div>

      <Card title="Room types">
        <RoomTypes campId={camp.id} roomTypes={roomTypes} />
      </Card>

      <Card title="Camp details">
        <CampForm camp={camp} />
      </Card>

      <Card title="Recent activity">
        {activity.length === 0 ? (
          <p className="text-sm text-slate-500">Nothing yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {activity.map((entry) => (
              <li key={entry.id} className="flex flex-wrap gap-x-3 text-slate-600">
                <span className="font-mono text-xs text-slate-400">{entry.created_at.slice(0, 16).replace("T", " ")}</span>
                <span className="font-medium text-slate-800">{entry.action}</span>
                <span>{entry.actor}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
