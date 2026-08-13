"use server";

import { supabaseAdmin } from "@/lib/supabase";
import { sendSMS } from "@/lib/mnotify";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AttendeePublic = {
  id: string;
  camp_id?: string;
  full_name: string;
  fellowship: string;
  room_type: string;
  room_number: string;
  key_bearer: string;
  room_id?: string;
  pfcc?: string;
  gender?: string;
  day_of_arrival?: string;
};

export type AttendeeAdmin = AttendeePublic & {
  phone_number?: string;
  created_at?: string;
};

export type Room = {
  id: string;
  camp_id: string;
  room_number: string;
  room_type: string;
  key_bearer_id?: string;
  created_at: string;
};

export type FellowshipGroup = {
  name: string;
  members: AttendeeAdmin[];
  unassigned: AttendeeAdmin[];
};

export type Group = {
  id: string;
  camp_id: string;
  group_number: number;
  room_type_preference?: string;
  room_id?: string;
  members?: AttendeeAdmin[];
  created_at: string;
};

export type Coordinator = {
  id: string;
  camp_id: string;
  email: string;
  status: "pending" | "accepted";
};

export type CampDetails = {
  id: string;
  name: string;
  slug: string;
  logo_url?: string;
  room_types: string[];
  admin_token: string;
  created_by?: string;
  created_at?: string;
};

// ─── Reactive Local Stores (DB fallback) ──────────────────────────────────────

let LOCAL_ATTENDEES_STORE: AttendeeAdmin[] = [
  // PFCC 1 – Youth Ablaze (Villa V-102)
  { id: "1", full_name: "Kwame Mensah", fellowship: "Youth Ablaze", room_type: "Villa", room_number: "V-102", key_bearer: "Kwame Mensah", room_id: "room-v102", phone_number: "0550076503", pfcc: "PFCC 1", gender: "Male", day_of_arrival: "Friday", created_at: new Date().toISOString() },
  { id: "2", full_name: "Prince Boakye", fellowship: "Youth Ablaze", room_type: "Villa", room_number: "V-102", key_bearer: "Kwame Mensah", room_id: "room-v102", phone_number: "0550076504", pfcc: "PFCC 1", gender: "Male", day_of_arrival: "Friday", created_at: new Date().toISOString() },
  { id: "3", full_name: "Samuel Osei", fellowship: "Youth Ablaze", room_type: "Villa", room_number: "V-102", key_bearer: "Kwame Mensah", room_id: "room-v102", phone_number: "0550076505", pfcc: "PFCC 1", gender: "Male", day_of_arrival: "Thursday", created_at: new Date().toISOString() },
  // PFCC 1 – Increase (Villa V-205)
  { id: "4", full_name: "Abena Mensah", fellowship: "Increase", room_type: "Villa", room_number: "V-205", key_bearer: "Abena Mensah", room_id: "room-v205", phone_number: "0240000010", pfcc: "PFCC 1", gender: "Female", day_of_arrival: "Friday", created_at: new Date().toISOString() },
  { id: "5", full_name: "Esi Owusu", fellowship: "Increase", room_type: "Villa", room_number: "V-205", key_bearer: "Abena Mensah", room_id: "room-v205", phone_number: "0240000011", pfcc: "PFCC 1", gender: "Female", day_of_arrival: "Friday", created_at: new Date().toISOString() },
  // PFCC 2 – Higher Achievers (Hostel H-304)
  { id: "6", full_name: "Ama Serwaa", fellowship: "Higher Achievers", room_type: "Hostel", room_number: "H-304", key_bearer: "Akosua Osei", room_id: "room-h304", phone_number: "0240000020", pfcc: "PFCC 2", gender: "Female", day_of_arrival: "Friday", created_at: new Date().toISOString() },
  { id: "7", full_name: "Akosua Osei", fellowship: "Higher Achievers", room_type: "Hostel", room_number: "H-304", key_bearer: "Akosua Osei", room_id: "room-h304", phone_number: "0240000021", pfcc: "PFCC 2", gender: "Female", day_of_arrival: "Friday", created_at: new Date().toISOString() },
  { id: "8", full_name: "Grace Appiah", fellowship: "Higher Achievers", room_type: "Hostel", room_number: "H-304", key_bearer: "Akosua Osei", room_id: "room-h304", phone_number: "0240000022", pfcc: "PFCC 2", gender: "Female", day_of_arrival: "Thursday", created_at: new Date().toISOString() },
  // PFCC 2 – Qadash (Dormitory D-01)
  { id: "9", full_name: "Yaw Osei", fellowship: "Qadash", room_type: "Dormitory", room_number: "D-01", key_bearer: "Kofi Annan", room_id: "room-d01", phone_number: "0200000030", pfcc: "PFCC 2", gender: "Male", day_of_arrival: "Thursday", created_at: new Date().toISOString() },
  { id: "10", full_name: "Kofi Annan", fellowship: "Qadash", room_type: "Dormitory", room_number: "D-01", key_bearer: "Kofi Annan", room_id: "room-d01", phone_number: "0200000031", pfcc: "PFCC 2", gender: "Male", day_of_arrival: "Friday", created_at: new Date().toISOString() },
  { id: "11", full_name: "Emmanuel Tetteh", fellowship: "Qadash", room_type: "Dormitory", room_number: "D-01", key_bearer: "Kofi Annan", room_id: "room-d01", phone_number: "0200000032", pfcc: "PFCC 2", gender: "Male", day_of_arrival: "Thursday", created_at: new Date().toISOString() },
  // Unassigned
  { id: "unassigned-1", full_name: "Nana Yaa Asante", fellowship: "Increase", room_type: "", room_number: "", key_bearer: "", room_id: undefined, phone_number: "0240000099", pfcc: "PFCC 1", gender: "Female", day_of_arrival: "Saturday", created_at: new Date().toISOString() },
  { id: "unassigned-2", full_name: "David Opoku", fellowship: "Higher Achievers", room_type: "", room_number: "", key_bearer: "", room_id: undefined, phone_number: "0200000099", pfcc: "PFCC 2", gender: "Male", day_of_arrival: "Friday", created_at: new Date().toISOString() },
];

let LOCAL_ROOMS_STORE: Room[] = [
  { id: "room-v102", camp_id: "camp-meeting-2026", room_number: "V-102", room_type: "Villa", key_bearer_id: "1", created_at: new Date().toISOString() },
  { id: "room-v205", camp_id: "camp-meeting-2026", room_number: "V-205", room_type: "Villa", key_bearer_id: "4", created_at: new Date().toISOString() },
  { id: "room-h304", camp_id: "camp-meeting-2026", room_number: "H-304", room_type: "Hostel", key_bearer_id: "7", created_at: new Date().toISOString() },
  { id: "room-d01", camp_id: "camp-meeting-2026", room_number: "D-01", room_type: "Dormitory", key_bearer_id: "10", created_at: new Date().toISOString() },
  { id: "room-w05", camp_id: "camp-meeting-2026", room_number: "W-05", room_type: "Wise as Serpents", key_bearer_id: "", created_at: new Date().toISOString() },
];

let LOCAL_COORDINATORS_STORE: Coordinator[] = [
  { id: "coord-1", camp_id: "camp-meeting-2026", email: "pastor@theairportcitychurch.com", status: "accepted" },
];

let LOCAL_CAMPS_STORE: CampDetails[] = [
  {
    id: "camp-meeting-2026",
    name: "TACC Church Camp Meeting 2026",
    slug: "tacc-camp-2026",
    room_types: ["Wise as Serpents", "Villa", "Hostel", "Dormitory"],
    admin_token: "portal-admin-26",
    created_at: new Date().toISOString(),
  },
];

// ─── Public Actions ───────────────────────────────────────────────────────────

export async function searchCampAttendees(query: string, campId?: string): Promise<{
  results: AttendeePublic[];
}> {
  if (!query || query.trim().length === 0) return { results: [] };
  const q = query.trim().toLowerCase();

  try {
    let dbQuery = supabaseAdmin
      .from("attendees")
      .select("id, camp_id, full_name, fellowship, room_type, room_number, key_bearer");
    if (campId) dbQuery = dbQuery.eq("camp_id", campId);
    const { data, error } = await dbQuery.ilike("full_name", `%${q}%`).limit(10);
    if (!error && data && data.length > 0) return { results: data as AttendeePublic[] };
  } catch {}

  return {
    results: LOCAL_ATTENDEES_STORE
      .filter(p => p.full_name.toLowerCase().includes(q))
      .map(p => ({ id: p.id, camp_id: p.camp_id, full_name: p.full_name, fellowship: p.fellowship, room_type: p.room_type, room_number: p.room_number, key_bearer: p.key_bearer, room_id: p.room_id })),
  };
}

export async function getRoomAssignmentDetails(personId: string, campId?: string): Promise<{
  person: AttendeePublic | null;
  roommates: AttendeePublic[];
}> {
  try {
    const { data: personData, error } = await supabaseAdmin
      .from("attendees").select("id, camp_id, full_name, fellowship, room_type, room_number, key_bearer").eq("id", personId).maybeSingle();
    if (!error && personData) {
      const roomNum = personData.room_number?.trim();
      const hasRoom = roomNum && roomNum.toUpperCase() !== "TBD";
      const { data: mates } = hasRoom
        ? await supabaseAdmin
            .from("attendees").select("id, camp_id, full_name, fellowship, room_type, room_number, key_bearer").eq("room_number", roomNum).neq("id", personData.id)
        : { data: [] };
      return { person: personData as AttendeePublic, roommates: (mates as AttendeePublic[]) || [] };
    }
  } catch {}

  const p = LOCAL_ATTENDEES_STORE.find(a => a.id === personId);
  if (!p) return { person: null, roommates: [] };
  const roomNum = p.room_number?.trim();
  const hasRoom = roomNum && roomNum.toUpperCase() !== "TBD";
  const mates = hasRoom
    ? LOCAL_ATTENDEES_STORE.filter(a => a.room_number?.trim() === roomNum && a.id !== p.id)
    : [];
  return {
    person: { id: p.id, full_name: p.full_name, fellowship: p.fellowship, room_type: p.room_type, room_number: p.room_number, key_bearer: p.key_bearer },
    roommates: mates.map(m => ({ id: m.id, full_name: m.full_name, fellowship: m.fellowship, room_type: m.room_type, room_number: m.room_number, key_bearer: m.key_bearer })),
  };
}

// ─── Admin — Camp ─────────────────────────────────────────────────────────────

export async function getCampByToken(adminToken: string): Promise<CampDetails | null> {
  try {
    const { data, error } = await supabaseAdmin.from("camps").select("*").eq("admin_token", adminToken).maybeSingle();
    if (!error && data) return { ...data, room_types: Array.isArray(data.room_types) ? data.room_types : JSON.parse(data.room_types || "[]") };
  } catch {}
  return LOCAL_CAMPS_STORE.find(c => c.admin_token === adminToken) || LOCAL_CAMPS_STORE[0];
}

export async function getCampBySlug(slug: string): Promise<CampDetails | null> {
  try {
    const { data, error } = await supabaseAdmin.from("camps").select("*").eq("slug", slug).maybeSingle();
    if (!error && data) return { ...data, room_types: Array.isArray(data.room_types) ? data.room_types : JSON.parse(data.room_types || "[]") };
  } catch {}
  return LOCAL_CAMPS_STORE.find(c => c.slug === slug) || null;
}

export async function getDefaultCamp(): Promise<CampDetails | null> {
  try {
    const { data, error } = await supabaseAdmin.from("camps").select("*").order("created_at").limit(1).maybeSingle();
    if (!error && data) return { ...data, room_types: Array.isArray(data.room_types) ? data.room_types : JSON.parse(data.room_types || "[]") };
  } catch {}
  return LOCAL_CAMPS_STORE[0] || null;
}

export async function getCampsList(): Promise<CampDetails[]> {
  try {
    const { data, error } = await supabaseAdmin.from("camps").select("*").order("created_at", { ascending: false });
    if (!error && data && data.length > 0) return data.map(c => ({ ...c, room_types: Array.isArray(c.room_types) ? c.room_types : JSON.parse(c.room_types || "[]") }));
  } catch {}
  return LOCAL_CAMPS_STORE;
}

export async function createCampAction(data: {
  name: string; slug: string; logoUrl?: string; roomTypes: string[];
}): Promise<{ success: boolean; camp?: CampDetails; error?: string }> {
  const newCamp: CampDetails = {
    id: `camp_${Date.now()}`,
    name: data.name,
    slug: data.slug.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
    logo_url: data.logoUrl,
    room_types: data.roomTypes,
    admin_token: `camp_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    created_at: new Date().toISOString(),
  };
  LOCAL_CAMPS_STORE.unshift(newCamp);
  try {
    const { data: dbData, error } = await supabaseAdmin.from("camps")
      .insert([{ name: data.name, slug: data.slug, logo_url: data.logoUrl, room_types: JSON.stringify(data.roomTypes) }])
      .select().single();
    if (!error && dbData) return { success: true, camp: { ...dbData, room_types: data.roomTypes } };
  } catch {}
  return { success: true, camp: newCamp };
}

export async function updateCampAction(campId: string, updates: {
  name?: string; logoUrl?: string; roomTypes?: string[];
}): Promise<{ success: boolean; error?: string }> {
  const idx = LOCAL_CAMPS_STORE.findIndex(c => c.id === campId);
  if (idx !== -1) {
    if (updates.name) LOCAL_CAMPS_STORE[idx].name = updates.name;
    if (updates.logoUrl !== undefined) LOCAL_CAMPS_STORE[idx].logo_url = updates.logoUrl;
    if (updates.roomTypes) LOCAL_CAMPS_STORE[idx].room_types = updates.roomTypes;
  }
  try {
    const payload: any = {};
    if (updates.name) payload.name = updates.name;
    if (updates.logoUrl !== undefined) payload.logo_url = updates.logoUrl;
    if (updates.roomTypes) payload.room_types = JSON.stringify(updates.roomTypes);
    await supabaseAdmin.from("camps").update(payload).eq("id", campId);
  } catch {}
  return { success: true };
}

// ─── Admin — Attendees ────────────────────────────────────────────────────────

export async function getAdminAttendees(campId: string): Promise<AttendeeAdmin[]> {
  try {
    const { data, error } = await supabaseAdmin.from("attendees").select("*").eq("camp_id", campId);
    if (!error && data && data.length > 0) return data as AttendeeAdmin[];
  } catch {}
  return LOCAL_ATTENDEES_STORE.filter(a => a.camp_id === campId || (!a.camp_id && campId === "camp-meeting-2026"));
}

export async function addAttendeeAction(data: {
  campId: string; fullName: string; fellowship: string;
  roomType?: string; roomNumber?: string; phoneNumber?: string;
  pfcc?: string; gender?: string; dayOfArrival?: string;
}): Promise<{ success: boolean; id?: string; error?: string }> {
  const newId = `att_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`;
  const newItem: any = {
    id: newId,
    camp_id: data.campId,
    full_name: data.fullName,
    fellowship: data.fellowship,
    room_type: data.roomType || "",
    room_number: data.roomNumber || "",
    key_bearer: "",
    room_id: undefined,
    phone_number: data.phoneNumber || "",
    pfcc: data.pfcc || "",
    gender: data.gender || "",
    day_of_arrival: data.dayOfArrival || "",
    created_at: new Date().toISOString(),
  };
  LOCAL_ATTENDEES_STORE.unshift(newItem);
  try {
    await supabaseAdmin.from("attendees").insert([{
      camp_id: data.campId, full_name: data.fullName, fellowship: data.fellowship,
      room_type: data.roomType || "", room_number: data.roomNumber || "", key_bearer: "",
      pfcc: data.pfcc || "", gender: data.gender || "", day_of_arrival: data.dayOfArrival || "",
    }]);
  } catch {}
  return { success: true, id: newId };
}

export async function bulkUploadAttendeesAction(
  campId: string,
  list: Array<{ full_name: string; fellowship: string; room_type?: string; room_number?: string; key_bearer?: string; phone_number?: string; pfcc?: string; gender?: string; day_of_arrival?: string }>,
): Promise<{ success: boolean; count?: number; error?: string }> {
  let count = 0;
  for (const item of list) {
    const res = await addAttendeeAction({ campId, fullName: item.full_name, fellowship: item.fellowship, roomType: item.room_type, roomNumber: item.room_number, phoneNumber: item.phone_number, pfcc: item.pfcc, gender: item.gender, dayOfArrival: item.day_of_arrival });
    if (res.success) count++;
  }
  return { success: true, count };
}

// ─── Import Real CSV (NO. / NAME / CONTACT / FELLOWSHIP / GENDER / DAY OF ARRIVAL / PFCC / ROOM NUMBER) ─

export async function importRealCSVAction(
  campId: string,
  rows: Array<{
    full_name: string;
    fellowship: string;
    phone_number?: string;
    gender?: string;
    day_of_arrival?: string;
    pfcc?: string;
    room_number?: string;
  }>,
  detectedRoomType?: string
): Promise<{ success: boolean; peopleCreated: number; roomsCreated: number; error?: string }> {
  let peopleCreated = 0;
  let roomsCreated = 0;

  // Auto-create rooms for unique room numbers that are provided
  const existingRooms = LOCAL_ROOMS_STORE.filter(r => r.camp_id === campId);
  const uniqueRooms = [...new Set(rows.map(r => r.room_number).filter(Boolean))];

  for (const roomNum of uniqueRooms) {
    if (!roomNum) continue;
    const exists = existingRooms.find(r => r.room_number === roomNum);
    if (!exists) {
      const newRoom: Room = {
        id: `room_${Date.now()}_${roomNum?.replace(/\s/g, '')}_${Math.random().toString(36).substring(2, 4)}`,
        camp_id: campId,
        room_number: roomNum!,
        room_type: detectedRoomType || "General",
        created_at: new Date().toISOString(),
      };
      LOCAL_ROOMS_STORE.push(newRoom);
      roomsCreated++;
      try { await supabaseAdmin.from("rooms").insert([{ camp_id: campId, room_number: roomNum, room_type: detectedRoomType || "General" }]); } catch {}
    }
  }

  for (const row of rows) {
    // Only link to room if a room number was provided in the CSV
    const room = row.room_number ? LOCAL_ROOMS_STORE.find(r => r.camp_id === campId && r.room_number === row.room_number) : undefined;
    const res = await addAttendeeAction({
      campId,
      fullName: row.full_name,
      fellowship: row.fellowship || "General",
      roomNumber: row.room_number || "",
      roomType: room?.room_type || detectedRoomType || "",
      phoneNumber: row.phone_number || "",
      pfcc: row.pfcc || "",
      gender: row.gender || "",
      dayOfArrival: row.day_of_arrival || "",
    });
    if (res.success) {
      if (room && res.id) {
        LOCAL_ATTENDEES_STORE = LOCAL_ATTENDEES_STORE.map(a =>
          a.id === res.id ? { ...a, room_id: room.id } : a
        );
      }
      peopleCreated++;
    }
  }

  return { success: true, peopleCreated, roomsCreated };
}

export async function clearCampAttendeesAndRoomsAction(campId: string): Promise<{ success: boolean }> {
  LOCAL_ATTENDEES_STORE = LOCAL_ATTENDEES_STORE.filter(a => a.camp_id && a.camp_id !== campId);
  LOCAL_ROOMS_STORE = LOCAL_ROOMS_STORE.filter(r => r.camp_id !== campId);
  try {
    await supabaseAdmin.from("attendees").delete().eq("camp_id", campId);
    await supabaseAdmin.from("rooms").delete().eq("camp_id", campId);
  } catch {}
  return { success: true };
}

export async function deleteAttendeeAction(id: string): Promise<{ success: boolean; error?: string }> {
  LOCAL_ATTENDEES_STORE = LOCAL_ATTENDEES_STORE.filter(a => a.id !== id);
  try { await supabaseAdmin.from("attendees").delete().eq("id", id); } catch {}
  return { success: true };
}

// ─── Admin — Rooms ────────────────────────────────────────────────────────────

export async function getRoomsAction(campId: string): Promise<Room[]> {
  try {
    const { data, error } = await supabaseAdmin.from("rooms").select("*").eq("camp_id", campId);
    if (!error && data && data.length > 0) return data as Room[];
  } catch {}
  return LOCAL_ROOMS_STORE.filter(r => r.camp_id === campId);
}

export async function addRoomAction(campId: string, roomNumber: string, roomType: string): Promise<{ success: boolean; room?: Room; error?: string }> {
  if (LOCAL_ROOMS_STORE.find(r => r.camp_id === campId && r.room_number === roomNumber)) {
    return { success: false, error: `Room ${roomNumber} already exists.` };
  }
  const newRoom: Room = { id: `room_${Date.now()}`, camp_id: campId, room_number: roomNumber, room_type: roomType, created_at: new Date().toISOString() };
  LOCAL_ROOMS_STORE.push(newRoom);
  try { await supabaseAdmin.from("rooms").insert([{ camp_id: campId, room_number: roomNumber, room_type: roomType }]); } catch {}
  return { success: true, room: newRoom };
}

export async function deleteRoomAction(roomId: string): Promise<{ success: boolean; error?: string }> {
  const room = LOCAL_ROOMS_STORE.find(r => r.id === roomId);
  if (room) {
    // Unassign all people from this room
    LOCAL_ATTENDEES_STORE = LOCAL_ATTENDEES_STORE.map(a => a.room_id === roomId ? { ...a, room_id: undefined, room_number: "", room_type: "", key_bearer: "" } : a);
  }
  LOCAL_ROOMS_STORE = LOCAL_ROOMS_STORE.filter(r => r.id !== roomId);
  try { await supabaseAdmin.from("rooms").delete().eq("id", roomId); } catch {}
  return { success: true };
}

export async function assignPersonToRoomAction(personId: string, roomId: string): Promise<{ success: boolean; error?: string }> {
  const room = LOCAL_ROOMS_STORE.find(r => r.id === roomId);
  if (!room) return { success: false, error: "Room not found" };

  const person = LOCAL_ATTENDEES_STORE.find(a => a.id === personId);
  const groupId = (person as any)?.group_id;

  // Only assign the specific person to the room
  LOCAL_ATTENDEES_STORE = LOCAL_ATTENDEES_STORE.map(a =>
    a.id === personId
      ? { ...a, room_id: roomId, room_number: room.room_number, room_type: room.room_type }
      : a
  );

  // If person belongs to a group, check if ALL group members are now in the same room
  if (groupId) {
    const groupMembers = LOCAL_ATTENDEES_STORE.filter(a => (a as any).group_id === groupId);
    const allInSameRoom = groupMembers.length > 0 && groupMembers.every(m => m.room_id === roomId);
    if (allInSameRoom) {
      LOCAL_GROUPS_STORE = LOCAL_GROUPS_STORE.map(g =>
        g.id === groupId ? { ...g, room_id: roomId } : g
      );
      try { await supabaseAdmin.from("groups").update({ room_id: roomId }).eq("id", groupId); } catch {}
    }
  }

  try {
    await supabaseAdmin.from("attendees").update({ room_number: room.room_number, room_type: room.room_type }).eq("id", personId);
  } catch {}
  return { success: true };
}

export async function removePersonFromRoomAction(personId: string): Promise<{ success: boolean; error?: string }> {
  const person = LOCAL_ATTENDEES_STORE.find(a => a.id === personId);
  const groupId = (person as any)?.group_id;

  // Only unassign the specific person
  LOCAL_ATTENDEES_STORE = LOCAL_ATTENDEES_STORE.map(a =>
    a.id === personId ? { ...a, room_id: undefined, room_number: "", room_type: "", key_bearer: "" } : a
  );

  if (groupId) {
    // Since this person was removed, group is no longer fully assigned to a single room
    LOCAL_GROUPS_STORE = LOCAL_GROUPS_STORE.map(g =>
      g.id === groupId ? { ...g, room_id: undefined } : g
    );
    try { await supabaseAdmin.from("groups").update({ room_id: null }).eq("id", groupId); } catch {}
  }

  try { await supabaseAdmin.from("attendees").update({ room_number: "", room_type: "", key_bearer: "" }).eq("id", personId); } catch {}
  return { success: true };
}

export async function setKeyBearerAction(roomId: string, personId: string): Promise<{ success: boolean; error?: string }> {
  const room = LOCAL_ROOMS_STORE.find(r => r.id === roomId);
  if (!room) return { success: false, error: "Room not found" };
  const person = LOCAL_ATTENDEES_STORE.find(a => a.id === personId);
  if (!person) return { success: false, error: "Person not found" };

  // Update room's key bearer
  LOCAL_ROOMS_STORE = LOCAL_ROOMS_STORE.map(r => r.id === roomId ? { ...r, key_bearer_id: personId } : r);
  // Update all people in the room to reflect who holds the key
  LOCAL_ATTENDEES_STORE = LOCAL_ATTENDEES_STORE.map(a =>
    a.room_id === roomId ? { ...a, key_bearer: person.full_name } : a
  );
  return { success: true };
}

export async function getRoomOccupants(roomId: string): Promise<AttendeeAdmin[]> {
  return LOCAL_ATTENDEES_STORE.filter(a => a.room_id === roomId);
}

// ─── Admin — Fellowships ──────────────────────────────────────────────────────

export type PFCCGroup = {
  name: string;
  fellowships: FellowshipGroup[];
  totalMembers: number;
  assignedMembers: number;
};

export async function getFellowshipsAction(campId: string): Promise<FellowshipGroup[]> {
  const attendees = await getAdminAttendees(campId);
  const grouped = new Map<string, AttendeeAdmin[]>();
  for (const a of attendees) {
    const key = a.fellowship || "General";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(a);
  }
  return Array.from(grouped.entries()).map(([name, members]) => ({
    name,
    members,
    unassigned: members.filter(m => !m.room_number),
  })).sort((a, b) => a.name.localeCompare(b.name));
}

export async function getPFCCGroupsAction(campId: string): Promise<PFCCGroup[]> {
  const fellowships = await getFellowshipsAction(campId);
  const attendees = await getAdminAttendees(campId);

  // Group fellowships by PFCC
  const pfccMap = new Map<string, FellowshipGroup[]>();
  const allPFCCs = [...new Set(attendees.map(a => (a as any).pfcc || "Unassigned"))];
  for (const pfcc of allPFCCs) {
    const pfccAttendees = attendees.filter(a => ((a as any).pfcc || "Unassigned") === pfcc);
    const pfccFellowships = new Map<string, AttendeeAdmin[]>();
    for (const a of pfccAttendees) {
      const key = a.fellowship || "General";
      if (!pfccFellowships.has(key)) pfccFellowships.set(key, []);
      pfccFellowships.get(key)!.push(a);
    }
    pfccMap.set(pfcc, Array.from(pfccFellowships.entries()).map(([name, members]) => ({
      name,
      members,
      unassigned: members.filter(m => !m.room_number),
    })));
  }

  return Array.from(pfccMap.entries()).map(([name, pfccFellowships]) => {
    const totalMembers = pfccFellowships.reduce((s, f) => s + f.members.length, 0);
    const assignedMembers = pfccFellowships.reduce((s, f) => s + f.members.filter(m => m.room_number).length, 0);
    return { name, fellowships: pfccFellowships, totalMembers, assignedMembers };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

export async function getFellowshipNames(campId: string): Promise<string[]> {
  const all = await getAdminAttendees(campId);
  return [...new Set(all.map(a => a.fellowship).filter(Boolean))].sort();
}

// ─── Admin — Coordinators ─────────────────────────────────────────────────────

export async function getCoordinatorsAction(campId: string): Promise<Coordinator[]> {
  try {
    const { data, error } = await supabaseAdmin.from("camp_admins").select("*").eq("camp_id", campId);
    if (!error && data && data.length > 0) return data as Coordinator[];
  } catch {}
  return LOCAL_COORDINATORS_STORE.filter(c => c.camp_id === campId);
}

export async function addCoordinatorAction(campId: string, email: string): Promise<{ success: boolean; error?: string }> {
  if (LOCAL_COORDINATORS_STORE.find(c => c.camp_id === campId && c.email === email)) {
    return { success: false, error: "This email is already a coordinator." };
  }
  const newCoord: Coordinator = { id: `coord_${Date.now()}`, camp_id: campId, email, status: "accepted" };
  LOCAL_COORDINATORS_STORE.push(newCoord);
  try { await supabaseAdmin.from("camp_admins").insert([{ camp_id: campId, email, status: "accepted" }]); } catch {}
  return { success: true };
}

export async function removeCoordinatorAction(campId: string, coordinatorId: string): Promise<{ success: boolean; error?: string }> {
  LOCAL_COORDINATORS_STORE = LOCAL_COORDINATORS_STORE.filter(c => !(c.camp_id === campId && c.id === coordinatorId));
  try { await supabaseAdmin.from("camp_admins").delete().eq("id", coordinatorId); } catch {}
  return { success: true };
}

// ─── Admin — SMS ──────────────────────────────────────────────────────────────

export async function sendRoomAssignmentSMSAction(params: {
  name: string; roomNumber: string; roomType: string; keyBearer: string; phoneNumber: string;
}): Promise<{ success: boolean; error?: string }> {
  const phone = params.phoneNumber || "0550076503";
  const message = `Hi ${params.name}, your camp room is ${params.roomNumber} (${params.roomType}). ${params.keyBearer} has the key. – TACC Camp Meeting`;
  const ok = await sendSMS(phone, message);
  return { success: ok };
}

// ─── Admin — Groups ───────────────────────────────────────────────────────────

let LOCAL_GROUPS_STORE: Group[] = [];

export async function getGroupsAction(campId: string): Promise<Group[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from("groups")
      .select("*")
      .eq("camp_id", campId)
      .order("group_number");
    if (!error && data && data.length > 0) {
      // Attach members
      const attendees = await getAdminAttendees(campId);
      return data.map((g: any) => {
        const members = attendees.filter(a => (a as any).group_id === g.id);
        const allInSameRoom = members.length > 0 && members.every(m => m.room_id && m.room_id === members[0].room_id)
          ? members[0].room_id
          : undefined;
        return {
          ...g,
          room_id: g.room_id || allInSameRoom,
          members,
        };
      });
    }
  } catch {}

  const attendees = LOCAL_ATTENDEES_STORE.filter(a => a.camp_id === campId || !a.camp_id);
  return LOCAL_GROUPS_STORE
    .filter(g => g.camp_id === campId)
    .map(g => {
      const members = attendees.filter(a => (a as any).group_id === g.id);
      const allInSameRoom = members.length > 0 && members.every(m => m.room_id && m.room_id === members[0].room_id)
        ? members[0].room_id
        : undefined;
      return {
        ...g,
        room_id: g.room_id || allInSameRoom,
        members,
      };
    });
}

export async function importGroupsFromCSVAction(
  campId: string,
  rows: Array<{
    full_name: string;
    fellowship: string;
    group_id: string;
    phone_number?: string;
    pfcc?: string;
    gender?: string;
    day_of_arrival?: string;
  }>,
  roomTypePreference: string
): Promise<{ success: boolean; groupsCreated: number; peopleCreated: number; error?: string }> {
  // Pre-pass: Map non-empty PFCC for each group_id so missing PFCC values in a group inherit it
  const groupPfccMap = new Map<string, string>();
  for (const row of rows) {
    const key = String(row.group_id).trim();
    if (row.pfcc?.trim() && !groupPfccMap.has(key)) {
      groupPfccMap.set(key, row.pfcc.trim());
    }
  }

  // Group rows by group_id value
  const groupMap = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = String(row.group_id).trim();
    if (!groupMap.has(key)) groupMap.set(key, []);
    const inheritedPfcc = row.pfcc?.trim() || groupPfccMap.get(key) || "";
    groupMap.get(key)!.push({ ...row, pfcc: inheritedPfcc });
  }

  const existingGroups = LOCAL_GROUPS_STORE.filter(g => g.camp_id === campId);
  const nextGroupNumber = existingGroups.length > 0
    ? Math.max(...existingGroups.map(g => g.group_number)) + 1
    : 1;

  let groupsCreated = 0;
  let peopleCreated = 0;
  let groupCounter = nextGroupNumber;

  for (const [, members] of groupMap.entries()) {
    const groupId = `group_${Date.now()}_${groupCounter}`;
    const newGroup: Group = {
      id: groupId,
      camp_id: campId,
      group_number: groupCounter++,
      room_type_preference: roomTypePreference,
      created_at: new Date().toISOString(),
    };
    LOCAL_GROUPS_STORE.push(newGroup);
    groupsCreated++;

    for (const member of members) {
      const personId = `att_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`;
      const newAttendee: any = {
        id: personId,
        camp_id: campId,
        full_name: member.full_name.trim(),
        fellowship: member.fellowship?.trim() || "General",
        room_type: "",
        room_number: "",
        key_bearer: "",
        room_id: undefined,
        group_id: groupId,
        phone_number: member.phone_number || "",
        pfcc: member.pfcc || "",
        gender: member.gender || "",
        day_of_arrival: member.day_of_arrival || "",
        created_at: new Date().toISOString(),
      };
      LOCAL_ATTENDEES_STORE.unshift(newAttendee);
      try {
        await supabaseAdmin.from("attendees").insert([{
          camp_id: campId,
          full_name: member.full_name.trim(),
          fellowship: member.fellowship?.trim() || "General",
          room_type: "",
          room_number: "",
          key_bearer: "",
          pfcc: member.pfcc || "",
          gender: member.gender || "",
          day_of_arrival: member.day_of_arrival || "",
        }]);
      } catch {}
      peopleCreated++;
    }
  }

  return { success: true, groupsCreated, peopleCreated };
}

export async function assignGroupToRoomAction(
  groupId: string,
  roomId: string
): Promise<{ success: boolean; error?: string }> {
  const room = LOCAL_ROOMS_STORE.find(r => r.id === roomId);
  if (!room) return { success: false, error: "Room not found" };

  // Update group's room_id
  LOCAL_GROUPS_STORE = LOCAL_GROUPS_STORE.map(g =>
    g.id === groupId ? { ...g, room_id: roomId } : g
  );

  // Update all attendees in this group
  LOCAL_ATTENDEES_STORE = LOCAL_ATTENDEES_STORE.map(a =>
    (a as any).group_id === groupId
      ? { ...a, room_id: roomId, room_number: room.room_number, room_type: room.room_type }
      : a
  );

  return { success: true };
}

export async function unassignGroupFromRoomAction(groupId: string): Promise<{ success: boolean }> {
  LOCAL_GROUPS_STORE = LOCAL_GROUPS_STORE.map(g =>
    g.id === groupId ? { ...g, room_id: undefined } : g
  );
  LOCAL_ATTENDEES_STORE = LOCAL_ATTENDEES_STORE.map(a =>
    (a as any).group_id === groupId
      ? { ...a, room_id: undefined, room_number: "", room_type: "" }
      : a
  );
  return { success: true };
}

export async function deleteGroupAction(groupId: string): Promise<{ success: boolean }> {
  // Remove attendees that belong to this group
  LOCAL_ATTENDEES_STORE = LOCAL_ATTENDEES_STORE.filter(a => (a as any).group_id !== groupId);
  LOCAL_GROUPS_STORE = LOCAL_GROUPS_STORE.filter(g => g.id !== groupId);
  return { success: true };
}

// ─── Admin — Logo Upload ──────────────────────────────────────────────────────

export async function uploadCampLogoAction(
  campId: string,
  fileBase64: string,
  fileName: string,
  mimeType: string
): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    const buffer = Buffer.from(fileBase64, "base64");
    const path = `${campId}/${Date.now()}_${fileName}`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from("camp-logos")
      .upload(path, buffer, { contentType: mimeType, upsert: true });
    if (uploadError) throw uploadError;
    const { data } = supabaseAdmin.storage.from("camp-logos").getPublicUrl(path);
    await updateCampAction(campId, { logoUrl: data.publicUrl });
    return { success: true, url: data.publicUrl };
  } catch (err: any) {
    // Fallback: return a placeholder so UI doesn't break
    return { success: false, error: err?.message || "Upload failed" };
  }
}
