import type { RoomWithOccupants, WaitingGroup, WaitingPerson } from "./types";

/**
 * "Fill rooms for me": a draft placement for one pool (a room type and a gender),
 * for a coordinator to check before anything is saved. Pure, so the board can show it
 * straight away; saving goes through assignGroup / assignPerson, which check every rule
 * (gender, room type, fully paid, free beds) again.
 *
 * Groups first, largest first, each kept together: with the members already placed if
 * some are, else in the room that fits them most tightly. Then everyone else, side by side
 * with their own fellowship, filling rooms that already have people before empty ones.
 */

export type FillStep =
  | { kind: "group"; groupId: string; roomId: string; names: string[] }
  | { kind: "person"; registrationId: string; roomId: string; names: string[] };

export type FillPlan = {
  steps: FillStep[];
  /** Room by room, for the draft: who goes where. */
  rooms: { roomId: string; label: string; names: string[] }[];
  /** Who couldn't be placed, and why. */
  left: { names: string[]; reason: string }[];
};

type Board = { rooms: RoomWithOccupants[]; groups: WaitingGroup[]; people: WaitingPerson[] };

const byLabel = (a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label, undefined, { numeric: true });

export function planFill(board: Board): FillPlan {
  const free = new Map(board.rooms.map((r) => [r.id, r.capacity - r.occupied]));
  const label = new Map(board.rooms.map((r) => [r.id, r.label]));
  const idOfLabel = new Map(board.rooms.map((r) => [r.label, r.id]));
  const draft = new Map<string, string[]>();
  const steps: FillStep[] = [];
  const left: FillPlan["left"] = [];
  const put = (roomId: string, names: string[]) => {
    free.set(roomId, (free.get(roomId) ?? 0) - names.length);
    draft.set(roomId, [...(draft.get(roomId) ?? []), ...names]);
  };

  const groups = board.groups
    .map((g) => ({ g, waiting: g.members.filter((m) => !m.room_label), placed: g.members.find((m) => m.room_label)?.room_label ?? null }))
    .filter((x) => x.waiting.length > 0)
    .sort((a, b) => b.waiting.length - a.waiting.length);
  for (const { g, waiting, placed } of groups) {
    const names = waiting.map((m) => m.full_name);
    const need = waiting.length;
    let roomId: string | undefined;
    if (placed) {
      // Part of the group already has a room: the rest join them there, or not at all.
      const id = idOfLabel.get(placed);
      if (id && (free.get(id) ?? 0) >= need) roomId = id;
      else {
        left.push({ names, reason: `The rest of their group is in ${placed}, which hasn't room for ${need} more.` });
        continue;
      }
    } else {
      // The tightest fit, so big rooms stay free for big groups.
      roomId = [...board.rooms]
        .filter((r) => (free.get(r.id) ?? 0) >= need)
        .sort((a, b) => (free.get(a.id) ?? 0) - (free.get(b.id) ?? 0) || byLabel(a, b))[0]?.id;
      if (!roomId) {
        left.push({ names, reason: `No room has ${need} beds free together.` });
        continue;
      }
    }
    steps.push({ kind: "group", groupId: g.id, roomId, names });
    put(roomId, names);
  }

  // Everyone else, fellowship by fellowship, into rooms with people already first.
  const people = [...board.people].sort((a, b) => a.fellowship.localeCompare(b.fellowship) || a.full_name.localeCompare(b.full_name));
  const order = () =>
    [...board.rooms]
      .filter((r) => (free.get(r.id) ?? 0) > 0)
      .sort((a, b) => {
        const started = (r: RoomWithOccupants) => (r.occupied > 0 || draft.has(r.id) ? 0 : 1);
        return started(a) - started(b) || (free.get(a.id) ?? 0) - (free.get(b.id) ?? 0) || byLabel(a, b);
      });
  let current: string | undefined;
  for (const p of people) {
    if (!current || (free.get(current) ?? 0) <= 0) current = order()[0]?.id;
    if (!current) {
      left.push({ names: [p.full_name], reason: "No beds left in this room type." });
      continue;
    }
    steps.push({ kind: "person", registrationId: p.id, roomId: current, names: [p.full_name] });
    put(current, [p.full_name]);
  }

  const rooms = [...draft.entries()]
    .map(([roomId, names]) => ({ roomId, label: label.get(roomId) ?? "", names }))
    .sort(byLabel);
  return { steps, rooms, left };
}
