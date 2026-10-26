import Link from "next/link";
import { notFound } from "next/navigation";
import { getPoolBoard, listPools, listRoomsWithOccupants } from "@/lib/camp/assignments";
import { getCamp, ID } from "@/lib/camp/camps";
import { listRoomSmsPending } from "@/lib/camp/room-sms";
import { listRoomTypes } from "@/lib/camp/rooms";
import { GENDERS, type Gender, type Pool } from "@/lib/camp/types";
import { headlineClass } from "@/components/camp/ui";
import { cn } from "@/lib/utils";
import { NoAccess, pageStaff } from "../../access";
import { AllRooms } from "./AllRooms";
import { AssignBoard } from "./AssignBoard";
import { RoomTypesTab } from "./RoomTypesTab";

// Texting rooms sends one mNotify request per room, a few at a time.
export const maxDuration = 60;

const TABS = [
  ["assign", "Assign"],
  ["all", "All rooms"],
  ["types", "Room types"],
] as const;
type Tab = (typeof TABS)[number][0];

const poolKey = (p: Pick<Pool, "room_type_id" | "gender">) => `${p.room_type_id}.${p.gender}`;

/** Rooms: assigning people, every room and who's in it, and room types with places left. One place for all of it. */
export default async function RoomsPage({
  params,
  searchParams,
}: {
  params: Promise<{ campId: string }>;
  searchParams: Promise<{ tab?: string; pool?: string }>;
}) {
  const staff = await pageStaff("coordinator");
  if (!staff) return <NoAccess />;
  const { campId } = await params;
  if (!ID.test(campId)) notFound();
  const query = await searchParams;
  const tab: Tab = TABS.some(([t]) => t === query.tab) ? (query.tab as Tab) : "assign";

  const [camp, roomTypes, pools] = await Promise.all([getCamp(campId), listRoomTypes(campId), listPools(campId)]);
  if (!camp) notFound();
  const waiting = pools.reduce((n, p) => n + Math.max(0, p.fully_paid - p.assigned), 0);

  let body: React.ReactNode;
  if (tab === "types") {
    body = <RoomTypesTab campId={camp.id} roomTypes={roomTypes} />;
  } else if (tab === "all") {
    body = <AllRooms campId={camp.id} rooms={await listRoomsWithOccupants(camp.id)} roomTypes={roomTypes} />;
  } else {
    // Open on what can be done now: people waiting and beds free; then anyone waiting.
    const pool =
      pools.find((p) => poolKey(p) === query.pool) ??
      pools.find((p) => p.fully_paid > p.assigned && p.beds > p.assigned) ??
      pools.find((p) => p.fully_paid > p.assigned) ??
      pools[0];
    const [board, smsPending] = await Promise.all([
      pool && GENDERS.includes(pool.gender) ? getPoolBoard(camp.id, pool.room_type_id, pool.gender as Gender) : null,
      listRoomSmsPending(camp.id),
    ]);
    body = (
      <AssignBoard
        key={pool ? poolKey(pool) : "none"}
        campId={camp.id}
        pools={pools.map((p) => ({ key: poolKey(p), name: `${p.gender === "male" ? "Men" : "Women"} · ${p.room_type_name}`, waiting: Math.max(0, p.fully_paid - p.assigned) }))}
        current={pool ? poolKey(pool) : null}
        board={board}
        smsPending={smsPending.length}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className={`${headlineClass} text-[34px]`}>Rooms</h1>
        <nav aria-label="Rooms" className="flex gap-1 rounded-full border border-stone-border bg-white p-[3px]">
          {TABS.map(([t, label]) => (
            <Link
              key={t}
              href={`?tab=${t}`}
              aria-current={tab === t ? "page" : undefined}
              className={cn("cm-press flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-medium", tab === t ? "bg-soot text-white" : "text-ink-black")}
            >
              {label}
              {t === "assign" && waiting > 0 && <span className={cn("text-xs", tab === t ? "text-stone-muted" : "text-warm-gray")}>{waiting}</span>}
            </Link>
          ))}
        </nav>
      </header>
      {body}
    </div>
  );
}
