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
 *
 * "Place everyone at random" uses the same rules (groups stay together, never over a
 * room's beds) but shuffles which fitting room each group and person goes into, and
 * runs across every pool so coordinators don't have to drag or pick room by room.
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

function openPlan(board: Board) {
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
  const close = (): FillPlan => ({
    steps,
    rooms: [...draft.entries()]
      .map(([roomId, names]) => ({ roomId, label: label.get(roomId) ?? "", names }))
      .sort(byLabel),
    left,
  });
  return { free, idOfLabel, put, steps, left, close };
}

type Plan = ReturnType<typeof openPlan>;

/** A room already hosting a group (placed people, or a group put there this plan). */
function groupedRooms(board: Board, steps: FillStep[]) {
  const ids = new Set(board.rooms.filter((r) => r.occupants.some((o) => o.group_code)).map((r) => r.id));
  for (const s of steps) if (s.kind === "group") ids.add(s.roomId);
  return ids;
}

function waitingGroups(board: Board) {
  return board.groups
    .map((g) => ({ g, waiting: g.members.filter((m) => !m.room_label), placed: g.members.find((m) => m.room_label)?.room_label ?? null }))
    .filter((x) => x.waiting.length > 0)
    .sort((a, b) => b.waiting.length - a.waiting.length);
}

function placeGroup(plan: Plan, g: WaitingGroup, waiting: WaitingGroup["members"], placed: string | null, pick: (need: number) => string | undefined) {
  const names = waiting.map((m) => m.full_name);
  const need = waiting.length;
  let roomId: string | undefined;
  if (placed) {
    const id = plan.idOfLabel.get(placed);
    if (id && (plan.free.get(id) ?? 0) >= need) roomId = id;
    else {
      plan.left.push({ names, reason: `The rest of their group is in ${placed}, which hasn't room for ${need} more.` });
      return;
    }
  } else {
    roomId = pick(need);
    if (!roomId) {
      plan.left.push({ names, reason: `No room has ${need} beds free together.` });
      return;
    }
  }
  plan.steps.push({ kind: "group", groupId: g.id, roomId, names });
  plan.put(roomId, names);
}

function shuffle<T>(items: T[], rand: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function planFill(board: Board): FillPlan {
  const plan = openPlan(board);
  for (const { g, waiting, placed } of waitingGroups(board)) {
    const taken = groupedRooms(board, plan.steps);
    placeGroup(plan, g, waiting, placed, (need) =>
      [...board.rooms]
        .filter((r) => !taken.has(r.id) && (plan.free.get(r.id) ?? 0) >= need)
        .sort((a, b) => (plan.free.get(a.id) ?? 0) - (plan.free.get(b.id) ?? 0) || byLabel(a, b))[0]?.id,
    );
  }

  const people = [...board.people].sort((a, b) => a.fellowship.localeCompare(b.fellowship) || a.full_name.localeCompare(b.full_name));
  const order = () =>
    [...board.rooms]
      .filter((r) => (plan.free.get(r.id) ?? 0) > 0)
      .sort((a, b) => {
        const started = (r: RoomWithOccupants) => (r.occupied > 0 || plan.steps.some((s) => s.roomId === r.id) ? 0 : 1);
        return started(a) - started(b) || (plan.free.get(a.id) ?? 0) - (plan.free.get(b.id) ?? 0) || byLabel(a, b);
      });
  let current: string | undefined;
  for (const p of people) {
    if (!current || (plan.free.get(current) ?? 0) <= 0) current = order()[0]?.id;
    if (!current) {
      plan.left.push({ names: [p.full_name], reason: "No beds left in this room type." });
      continue;
    }
    plan.steps.push({ kind: "person", registrationId: p.id, roomId: current, names: [p.full_name] });
    plan.put(current, [p.full_name]);
  }

  return plan.close();
}

/**
 * Same constraints as planFill (groups together, never over capacity), but each
 * group and person goes into a random room that still has room. Largest groups
 * still go first so a 4-person group isn't stranded by smaller ones.
 */
export function planRandomFill(board: Board, rand: () => number = Math.random): FillPlan {
  const plan = openPlan(board);
  const fitting = (need: number, forGroup = false) => {
    const taken = forGroup ? groupedRooms(board, plan.steps) : new Set<string>();
    return shuffle(
      board.rooms.filter((r) => (!forGroup || !taken.has(r.id)) && (plan.free.get(r.id) ?? 0) >= need),
      rand,
    )[0]?.id;
  };

  for (const { g, waiting, placed } of waitingGroups(board)) {
    placeGroup(plan, g, waiting, placed, (need) => fitting(need, true));
  }

  for (const p of shuffle(board.people, rand)) {
    const roomId = fitting(1);
    if (!roomId) {
      plan.left.push({ names: [p.full_name], reason: "No beds left in this room type." });
      continue;
    }
    plan.steps.push({ kind: "person", registrationId: p.id, roomId, names: [p.full_name] });
    plan.put(roomId, [p.full_name]);
  }

  return plan.close();
}

function fakeRooms(n: number, capacity: number): RoomWithOccupants[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `__new-${i}`,
    camp_id: "",
    room_type_id: "",
    room_type_name: "",
    label: `__new-${i}`,
    gender: "female" as const,
    capacity,
    occupied: 0,
    occupants: [],
  }));
}

/**
 * How many extra rooms of `capacity` this pool needs so Place everyone can
 * seat every group (one group per room) and every ungrouped person.
 */
export function extraRoomsNeeded(board: Board, capacity: number): number {
  if (capacity < 1) return 0;
  const waiting = board.groups.reduce((n, g) => n + g.members.filter((m) => !m.room_label).length, 0) + board.people.length;
  if (waiting === 0) return 0;
  const keep = () => 0.999;
  let extra = 0;
  const max = waiting + board.groups.length + 2;
  while (extra <= max) {
    const rooms = extra === 0 ? board.rooms : [...board.rooms, ...fakeRooms(extra, capacity)];
    if (planRandomFill({ ...board, rooms }, keep).left.length === 0) return extra;
    extra++;
  }
  return extra;
}

const STOP = new Set(["in", "a", "an", "the", "of", "with", "room", "rooms", "and"]);

function genderLetter(gender: "male" | "female") {
  return gender === "male" ? "M" : "W";
}

function oldAutoPrefix(gender: "male" | "female", typeName: string) {
  return `${gender === "male" ? "Men" : "Women"} · ${typeName} `;
}

/** "AC6" from "6 in a room with AC"; "HST4" from Hostel. */
export function roomTypeCode(typeName: string, capacity: number): string {
  if (/\bAC\b/i.test(typeName)) return `AC${capacity}`;
  if (/\bfan\b/i.test(typeName)) return `FAN${capacity}`;
  const words = typeName.split(/[^a-z0-9]+/i).filter((w) => w && !STOP.has(w.toLowerCase()) && !/^\d+$/.test(w));
  const letters = (words[0] ?? typeName).replace(/[^a-z]/gi, "").toUpperCase();
  let stem = letters ? letters[0] + letters.slice(1).replace(/[AEIOU]/g, "") : "RM";
  if (stem.length < 3) stem = letters.slice(0, 3) || "RM";
  return `${stem.slice(0, 3)}${capacity}`;
}

function autoPrefix(gender: "male" | "female", typeName: string, capacity: number) {
  return `${genderLetter(gender)}-${roomTypeCode(typeName, capacity)}-`;
}

function numberAfter(label: string, prefix: string) {
  if (!label.startsWith(prefix)) return null;
  const rest = label.slice(prefix.length);
  if (!/^\d+$/.test(rest)) return null;
  const n = Number(rest);
  return n > 0 ? n : null;
}

function autoNumber(label: string, gender: "male" | "female", typeName: string, capacity?: number) {
  const old = numberAfter(label, oldAutoPrefix(gender, typeName));
  if (old != null) return old;
  if (capacity == null) return null;
  const n = numberAfter(label, autoPrefix(gender, typeName, capacity));
  return n;
}

/** "M-AC6-01". The number is at least two digits so the list lines up. */
export function formatAutoRoomLabel(gender: "male" | "female", typeName: string, capacity: number, n: number) {
  return `${autoPrefix(gender, typeName, capacity)}${String(n).padStart(2, "0")}`;
}

/** A label Place everyone / starting a group would have made, not a venue number. */
export function isAutoRoomLabel(label: string, gender: "male" | "female", typeName: string, capacity?: number) {
  return autoNumber(label, gender, typeName, capacity) != null;
}

/** The sequence number in an auto label, old or short. */
export function autoRoomNumber(label: string, gender: "male" | "female", typeName: string, capacity: number) {
  return autoNumber(label, gender, typeName, capacity);
}

/** "M-AC6-01", skipping labels already in the camp. Continues after old "Men · … 1" names. */
export function nextRoomLabels(
  existing: string[],
  gender: "male" | "female",
  typeName: string,
  capacity: number,
  count: number,
): string[] {
  let n = 0;
  for (const label of existing) {
    const num = autoNumber(label, gender, typeName, capacity);
    if (num != null && num > n) n = num;
  }
  return Array.from({ length: count }, (_, i) => formatAutoRoomLabel(gender, typeName, capacity, n + i + 1));
}
