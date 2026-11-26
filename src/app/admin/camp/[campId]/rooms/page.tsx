import Link from "next/link";
import { notFound } from "next/navigation";
import { getCampBoard, listRoomsWithOccupants } from "@/lib/camp/assignments";
import { getCamp, ID } from "@/lib/camp/camps";
import { listKeyBearers } from "@/lib/camp/key-bearers";
import { listRoomSmsPending } from "@/lib/camp/room-sms";
import { listRoomTypes } from "@/lib/camp/rooms";
import { headlineClass } from "@/components/camp/ui";
import { cn } from "@/lib/utils";
import { NoAccess, pageStaff } from "../../access";
import { AllRooms } from "./AllRooms";
import { AssignBoard } from "./AssignBoard";
import { KeyBearers } from "./KeyBearers";
import { RoomTypesTab } from "./RoomTypesTab";

// Texting rooms sends one mNotify request per room, a few at a time.
export const maxDuration = 60;

const TABS = [
  ["", "Place people"],
  ["all", "All rooms"],
  ["keys", "Key bearers"],
  ["types", "Room types"],
] as const;
type Tab = (typeof TABS)[number][0];

/** Rooms: people waiting on one side, rooms on the other. All rooms to edit them; room types are prices and beds. */
export default async function RoomsPage({
  params,
  searchParams,
}: {
  params: Promise<{ campId: string }>;
  searchParams: Promise<{ tab?: string; pool?: string; who?: string; type?: string }>;
}) {
  const staff = await pageStaff("coordinator");
  if (!staff) return <NoAccess />;
  const { campId } = await params;
  if (!ID.test(campId)) notFound();
  const query = await searchParams;
  const tab: Tab = TABS.some(([t]) => t && t === query.tab) ? (query.tab as Tab) : "";

  const [camp, roomTypes] = await Promise.all([getCamp(campId), listRoomTypes(campId)]);
  if (!camp) notFound();

  const [lanes, smsPending] = tab
    ? [[], []]
    : await Promise.all([getCampBoard(camp.id), listRoomSmsPending(camp.id)]);
  const waiting = lanes.reduce((n, l) => n + l.waiting, 0);

  let body: React.ReactNode;
  if (tab === "types") body = <RoomTypesTab campId={camp.id} roomTypes={roomTypes} />;
  else if (tab === "keys") {
    const k = await listKeyBearers(camp.id);
    body = <KeyBearers rows={k.rows} empty={k.empty} />;
  } else if (tab === "all") body = <AllRooms campId={camp.id} rooms={await listRoomsWithOccupants(camp.id)} roomTypes={roomTypes} />;
  else
    body = (
      <AssignBoard
        campId={camp.id}
        lanes={lanes}
        roomTypes={roomTypes}
        smsPending={smsPending.length}
        smsByApp={smsPending.slice(0, 250).filter((p) => p.has_push).length}
        startPool={query.pool ?? null}
        startWho={query.who === "male" || query.who === "female" ? query.who : ""}
        startType={query.type ?? ""}
      />
    );

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <h1 className={`${headlineClass} text-[34px] md:text-[40px]`}>
          {tab === "types" ? (
            "Room types"
          ) : tab === "keys" ? (
            "Key bearers"
          ) : tab === "all" ? (
            "All rooms"
          ) : !lanes.length ? (
            "Rooms"
          ) : waiting > 0 ? (
            <>
              <span className="text-cyan-edge tabular-nums">{waiting}</span> still {waiting === 1 ? "needs" : "need"} a room
            </>
          ) : (
            <>
              Everyone has a <span className="text-cyan-edge">room</span>
            </>
          )}
        </h1>
        <nav aria-label="Rooms" className="flex max-w-full gap-1 overflow-x-auto rounded-full border border-stone-border bg-white p-[3px]">
          {TABS.map(([t, label]) => (
            <Link
              key={t || "assign"}
              href={t ? `?tab=${t}` : "?"}
              aria-current={tab === t ? "page" : undefined}
              className={cn(
                "cm-press flex h-9 flex-none items-center rounded-full px-4 text-sm font-medium transition-colors",
                tab === t ? "bg-soot text-white" : "text-ink-black hover:bg-stone-rail",
              )}
            >
              {label}
            </Link>
          ))}
        </nav>
      </header>
      {body}
    </div>
  );
}
