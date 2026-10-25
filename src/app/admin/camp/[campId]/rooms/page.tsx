import { notFound } from "next/navigation";
import { CircleSlash } from "lucide-react";
import { getCamp, ID } from "@/lib/camp/camps";
import { formatCedis } from "@/lib/camp/money";
import { listRoomTypes, listRooms } from "@/lib/camp/rooms";
import type { RoomType } from "@/lib/camp/types";
import { Card, headlineClass } from "@/components/camp/ui";
import { NoAccess, pageStaff } from "../../access";
import { PlacesLeft } from "./PlacesLeft";
import { Rooms } from "./Rooms";

function Places({ n }: { n: number | null }) {
  if (n === null) return <span className="text-warm-gray">No limit</span>;
  if (n === 0)
    return (
      <span className="inline-flex items-center gap-1.5 font-medium">
        <CircleSlash className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" /> Full
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 font-medium">
      <span className="h-[7px] w-[7px] rounded-full bg-cyan-signal" /> {n} left
    </span>
  );
}

export default async function CampRoomsPage({ params }: { params: Promise<{ campId: string }> }) {
  const staff = await pageStaff("coordinator");
  if (!staff) return <NoAccess />;
  const { campId } = await params;
  if (!ID.test(campId)) notFound();

  const [camp, roomTypes, rooms] = await Promise.all([getCamp(campId), listRoomTypes(campId), listRooms(campId)]);
  if (!camp) notFound();
  const beds = rooms.reduce((sum, r) => sum + r.capacity, 0);
  const bedsOf = (t: RoomType) => rooms.filter((r) => r.room_type_id === t.id).reduce((s, r) => s + r.capacity, 0);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1.5">
        <h1 className={headlineClass}>
          Set up <span className="text-cyan-edge">rooms</span>
        </h1>
        <p className="text-sm text-warm-gray">
          {rooms.length} rooms · {beds} beds across {roomTypes.length} room type{roomTypes.length === 1 ? "" : "s"}. Prices and
          room types are on Settings.
        </p>
      </header>

      <div className="flex flex-wrap items-start gap-5">
        <Card title="Room types" className="min-w-0 flex-[999_1_520px]">
          {roomTypes.length === 0 ? (
            <p className="text-sm text-warm-gray">No room types yet. Add them on Settings first.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full whitespace-nowrap text-sm tabular-nums">
                <thead className="text-left text-xs text-warm-gray">
                  <tr>
                    <th className="pb-2.5 pr-3 font-medium">Type</th>
                    <th className="px-3 pb-2.5 font-medium">Price</th>
                    <th className="px-3 pb-2.5 font-medium">Women</th>
                    <th className="px-3 pb-2.5 font-medium">Men</th>
                    <th className="px-3 pb-2.5 font-medium">Beds a room</th>
                    <th className="pb-2.5 pl-3 text-right font-medium">Beds</th>
                  </tr>
                </thead>
                <tbody>
                  {roomTypes.map((t) => (
                    <tr key={t.id} className="border-t border-stone-border">
                      <td className="py-3 pr-3 font-medium">{t.name}</td>
                      <td className="px-3 py-3">{formatCedis(t.price_pesewas)}</td>
                      <td className="px-3 py-3">
                        <Places n={t.places_female} />
                      </td>
                      <td className="px-3 py-3">
                        <Places n={t.places_male} />
                      </td>
                      <td className="px-3 py-3">{t.capacity}</td>
                      <td className="py-3 pl-3 text-right">{bedsOf(t)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-[13px] leading-relaxed text-warm-gray">
            &ldquo;Places left&rdquo; is what the venue last told you. Cancelling doesn&apos;t give a place back: raise the
            number if the venue confirms it.
          </p>
        </Card>
        {roomTypes.length > 0 && (
          <div className="flex w-full flex-[1_1_300px] flex-col gap-5 sm:max-w-[380px]">
            <PlacesLeft roomTypes={roomTypes} />
          </div>
        )}
      </div>

      <Rooms campId={camp.id} rooms={rooms} roomTypes={roomTypes} />
    </div>
  );
}
