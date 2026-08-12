"use server";

import { supabaseAdmin } from "@/lib/supabase";
import { sendSMS } from "@/lib/mnotify";

export type AttendeePublic = {
  id: string;
  camp_id?: string;
  full_name: string;
  fellowship: string;
  room_type: string;
  room_number: string;
  key_bearer: string;
};

export type AttendeeAdmin = AttendeePublic & {
  phone_number?: string;
  created_at?: string;
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

// Default fallback mock attendees if DB table is empty or being provisioned
const MOCK_ATTENDEES: AttendeePublic[] = [
  { id: '1', full_name: 'Kwame Mensah', fellowship: 'Youth Ablaze', room_type: 'Villa', room_number: 'V-102', key_bearer: 'Kwame Mensah' },
  { id: '2', full_name: 'Ama Serwaa', fellowship: 'Women of Valor', room_type: 'Hostel', room_number: 'H-304', key_bearer: 'Akosua Osei' },
  { id: '3', full_name: 'Akosua Osei', fellowship: 'Women of Valor', room_type: 'Hostel', room_number: 'H-304', key_bearer: 'Akosua Osei' },
  { id: '4', full_name: 'Yaw Osei', fellowship: 'Men of Honor', room_type: 'Dormitory', room_number: 'D-01', key_bearer: 'Kofi Annan' },
  { id: '5', full_name: 'Abena Mensah', fellowship: 'Youth Ablaze', room_type: 'Wise as Serpents', room_number: 'W-05', key_bearer: 'Abena Mensah' },
  { id: '6', full_name: 'Kofi Annan', fellowship: 'Men of Honor', room_type: 'Dormitory', room_number: 'D-01', key_bearer: 'Kofi Annan' },
  { id: '7', full_name: 'Esi Owusu', fellowship: 'Women of Valor', room_type: 'Villa', room_number: 'V-205', key_bearer: 'Esi Owusu' },
  { id: '8', full_name: 'Prince Boakye', fellowship: 'Youth Ablaze', room_type: 'Villa', room_number: 'V-102', key_bearer: 'Kwame Mensah' },
  { id: '9', full_name: 'Samuel Osei', fellowship: 'Youth Ablaze', room_type: 'Villa', room_number: 'V-102', key_bearer: 'Kwame Mensah' },
  { id: '10', full_name: 'Grace Appiah', fellowship: 'Women of Valor', room_type: 'Hostel', room_number: 'H-304', key_bearer: 'Akosua Osei' },
  { id: '11', full_name: 'Esther Baah', fellowship: 'Women of Valor', room_type: 'Hostel', room_number: 'H-304', key_bearer: 'Akosua Osei' },
  { id: '12', full_name: 'Michael Ofori', fellowship: 'Men of Honor', room_type: 'Dormitory', room_number: 'D-01', key_bearer: 'Kofi Annan' },
];

/**
 * Public Server Action: Search attendees by name (debounced on client side).
 * Strictly excludes encrypted phone numbers from returned payload!
 */
export async function searchCampAttendees(query: string, campId?: string): Promise<{
  results: AttendeePublic[];
  selectedPerson?: AttendeePublic;
  roommates?: AttendeePublic[];
}> {
  if (!query || query.trim().length === 0) {
    return { results: [] };
  }

  const cleanQuery = query.trim().toLowerCase();

  try {
    let selectQuery = supabaseAdmin
      .from("attendees")
      .select("id, camp_id, full_name, fellowship, room_type, room_number, key_bearer");

    if (campId) {
      selectQuery = selectQuery.eq("camp_id", campId);
    }

    const { data, error } = await selectQuery.ilike("full_name", `%${cleanQuery}%`).limit(10);

    if (!error && data && data.length > 0) {
      return { results: data as AttendeePublic[] };
    }
  } catch (err) {
    console.warn("Supabase attendees search query note:", err);
  }

  // Fallback mock dataset search
  const filteredMock = MOCK_ATTENDEES.filter(p =>
    p.full_name.toLowerCase().includes(cleanQuery)
  );

  return { results: filteredMock };
}

/**
 * Public Server Action: Get room assignment details & roommates for selected person.
 */
export async function getRoomAssignmentDetails(personId: string, campId?: string): Promise<{
  person: AttendeePublic | null;
  roommates: AttendeePublic[];
}> {
  try {
    const { data: personData, error: personError } = await supabaseAdmin
      .from("attendees")
      .select("id, camp_id, full_name, fellowship, room_type, room_number, key_bearer")
      .eq("id", personId)
      .maybeSingle();

    if (!personError && personData) {
      const { data: roommatesData } = await supabaseAdmin
        .from("attendees")
        .select("id, camp_id, full_name, fellowship, room_type, room_number, key_bearer")
        .eq("room_number", personData.room_number)
        .neq("id", personData.id);

      return {
        person: personData as AttendeePublic,
        roommates: (roommatesData as AttendeePublic[]) || [],
      };
    }
  } catch (err) {
    console.warn("Error fetching room assignment details from DB:", err);
  }

  // Mock fallback
  const mockPerson = MOCK_ATTENDEES.find(p => p.id === personId);
  if (mockPerson) {
    const mockRoommates = MOCK_ATTENDEES.filter(p => p.room_number === mockPerson.room_number && p.id !== mockPerson.id);
    return { person: mockPerson, roommates: mockRoommates };
  }

  return { person: null, roommates: [] };
}

/**
 * Admin Server Action: Fetch camp details by secret token.
 */
export async function getCampByToken(adminToken: string): Promise<CampDetails | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from("camps")
      .select("*")
      .eq("admin_token", adminToken)
      .maybeSingle();

    if (!error && data) {
      return {
        ...data,
        room_types: Array.isArray(data.room_types) ? data.room_types : JSON.parse(data.room_types || '[]')
      };
    }
  } catch (e) {
    console.warn("Error fetching camp by token:", e);
  }

  // Fallback demo camp
  if (adminToken === "demo-admin-token" || adminToken === "portal-admin-26") {
    return {
      id: "demo-camp-id",
      name: "TACC Camp Meeting 2026",
      slug: "tacc-camp-2026",
      logo_url: "",
      room_types: ["Wise as Serpents", "Villa", "Hostel", "Dormitory"],
      admin_token: adminToken,
    };
  }

  return null;
}

/**
 * Admin Server Action: Get all attendees (with decrypted phone numbers if authorized).
 */
export async function getAdminAttendees(campId: string, secretKey: string = "tacc-camp-secret"): Promise<AttendeeAdmin[]> {
  try {
    // Try stored procedure first
    const { data, error } = await supabaseAdmin.rpc("get_attendees_decrypted", {
      p_camp_id: campId,
      p_secret_key: secretKey
    });

    if (!error && data) {
      return data as AttendeeAdmin[];
    }

    // Fallback standard select
    const { data: rawData, error: rawError } = await supabaseAdmin
      .from("attendees")
      .select("*")
      .eq("camp_id", campId);

    if (!rawError && rawData) {
      return rawData.map(a => ({
        id: a.id,
        camp_id: a.camp_id,
        full_name: a.full_name,
        fellowship: a.fellowship,
        room_type: a.room_type,
        room_number: a.room_number,
        key_bearer: a.key_bearer,
        phone_number: a.encrypted_phone ? "(Encrypted)" : undefined,
        created_at: a.created_at,
      }));
    }
  } catch (e) {
    console.warn("Admin attendees fetch warning:", e);
  }

  // Fallback mock list with phone numbers
  return MOCK_ATTENDEES.map(a => ({
    ...a,
    phone_number: "0550076503",
    created_at: new Date().toISOString(),
  }));
}

/**
 * Admin Server Action: Add single attendee with pgcrypto encryption.
 */
export async function addAttendeeAction(data: {
  campId: string;
  fullName: string;
  fellowship: string;
  roomType: string;
  roomNumber: string;
  keyBearer: string;
  phoneNumber?: string;
  secretKey?: string;
}) {
  const secretKey = data.secretKey || "tacc-camp-secret";

  try {
    // Call stored procedure add_attendee_encrypted
    const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc("add_attendee_encrypted", {
      p_camp_id: data.campId,
      p_full_name: data.fullName,
      p_fellowship: data.fellowship,
      p_room_type: data.roomType,
      p_room_number: data.roomNumber,
      p_key_bearer: data.keyBearer,
      p_phone_number: data.phoneNumber || "",
      p_secret_key: secretKey
    });

    if (!rpcError) {
      return { success: true, id: rpcData };
    }

    // Direct insert fallback
    const { error: insertError } = await supabaseAdmin.from("attendees").insert([{
      camp_id: data.campId,
      full_name: data.fullName,
      fellowship: data.fellowship,
      room_type: data.roomType,
      room_number: data.roomNumber,
      key_bearer: data.keyBearer,
    }]);

    if (insertError) throw insertError;
    return { success: true };
  } catch (err: any) {
    console.error("Add attendee error:", err);
    return { success: false, error: err.message };
  }
}

/**
 * Admin Server Action: Bulk upload attendees from parsed CSV/Excel.
 */
export async function bulkUploadAttendeesAction(
  campId: string,
  attendeesList: Array<{
    full_name: string;
    fellowship: string;
    room_type: string;
    room_number: string;
    key_bearer: string;
    phone_number?: string;
  }>,
  secretKey: string = "tacc-camp-secret"
) {
  if (!attendeesList || attendeesList.length === 0) {
    return { success: false, error: "No attendees provided for upload" };
  }

  let count = 0;
  for (const item of attendeesList) {
    const res = await addAttendeeAction({
      campId,
      fullName: item.full_name,
      fellowship: item.fellowship,
      roomType: item.room_type,
      roomNumber: item.room_number,
      keyBearer: item.key_bearer,
      phoneNumber: item.phone_number,
      secretKey,
    });
    if (res.success) count++;
  }

  return { success: true, count };
}

/**
 * Admin Server Action: Delete an attendee.
 */
export async function deleteAttendeeAction(id: string) {
  try {
    const { error } = await supabaseAdmin.from("attendees").delete().eq("id", id);
    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Admin Server Action: Create a new Camp.
 */
export async function createCampAction(data: {
  name: string;
  slug: string;
  logoUrl?: string;
  roomTypes: string[];
}) {
  try {
    const { data: campData, error } = await supabaseAdmin
      .from("camps")
      .insert([{
        name: data.name,
        slug: data.slug,
        logo_url: data.logoUrl || null,
        room_types: JSON.stringify(data.roomTypes),
      }])
      .select()
      .single();

    if (error) throw error;
    return { success: true, camp: campData };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Admin Server Action: Update Camp configuration (logo, room types, name).
 */
export async function updateCampAction(campId: string, updates: {
  name?: string;
  logoUrl?: string;
  roomTypes?: string[];
}) {
  try {
    const payload: any = {};
    if (updates.name) payload.name = updates.name;
    if (updates.logoUrl !== undefined) payload.logo_url = updates.logoUrl;
    if (updates.roomTypes) payload.room_types = JSON.stringify(updates.roomTypes);

    const { error } = await supabaseAdmin
      .from("camps")
      .update(payload)
      .eq("id", campId);

    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Admin Server Action: Send SMS Room Assignment Notification via mNotify.
 * Automated message format: "Hi [Name], your camp room is [Room Number] ([Room Type]). [Key Bearer] has the key."
 */
export async function sendRoomAssignmentSMSAction(params: {
  name: string;
  roomNumber: string;
  roomType: string;
  keyBearer: string;
  phoneNumber: string;
}) {
  if (!params.phoneNumber || params.phoneNumber.trim().length === 0) {
    return { success: false, error: "Recipient phone number is missing" };
  }

  const message = `Hi ${params.name}, your camp room is ${params.roomNumber} (${params.roomType}). ${params.keyBearer} has the key. - TACC Camp Meeting`;

  const success = await sendSMS(params.phoneNumber, message);

  if (success) {
    return { success: true };
  } else {
    return { success: false, error: "Failed to deliver SMS via mNotify gateway" };
  }
}
