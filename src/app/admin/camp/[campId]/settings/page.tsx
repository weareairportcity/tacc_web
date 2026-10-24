import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCamp, ID } from "@/lib/camp/camps";
import { listRoomTypes } from "@/lib/camp/rooms";
import { Card } from "@/components/camp/ui";
import { NoAccess, pageStaff } from "../../access";
import { CampForm } from "../../CampForm";
import { RoomTypes } from "./RoomTypes";

/** Room types and camp details, moved here when the camp page became the dashboard. */
export default async function CampSettingsPage({ params }: { params: Promise<{ campId: string }> }) {
  const staff = await pageStaff("coordinator");
  if (!staff) return <NoAccess />;
  const { campId } = await params;
  if (!ID.test(campId)) notFound();

  const [camp, roomTypes] = await Promise.all([getCamp(campId), listRoomTypes(campId)]);
  if (!camp) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/admin/camp/${camp.id}`} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" /> {camp.name}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Settings</h1>
      </div>

      <Card title="Room types">
        <RoomTypes campId={camp.id} roomTypes={roomTypes} />
      </Card>

      <Card title="Camp details">
        <CampForm camp={camp} />
      </Card>
    </div>
  );
}
