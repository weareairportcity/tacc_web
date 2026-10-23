import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCamp, ID } from "@/lib/camp/camps";
import { listRoomTypes, listRooms } from "@/lib/camp/rooms";
import { NoAccess, pageStaff } from "../../access";
import { Rooms } from "./Rooms";

export default async function CampRoomsPage({ params }: { params: Promise<{ campId: string }> }) {
  const staff = await pageStaff("coordinator");
  if (!staff) return <NoAccess />;
  const { campId } = await params;
  if (!ID.test(campId)) notFound();

  const [camp, roomTypes, rooms] = await Promise.all([getCamp(campId), listRoomTypes(campId), listRooms(campId)]);
  if (!camp) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/admin/camp/${camp.id}`}
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" /> {camp.name}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Rooms</h1>
      </div>
      <Rooms campId={camp.id} rooms={rooms} roomTypes={roomTypes} />
    </div>
  );
}
