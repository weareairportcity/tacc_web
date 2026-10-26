/** Shared camp types. Money is integer pesewas (GHS x 100) everywhere. */

export const CAMP_STATUSES = ["draft", "open", "closed", "archived"] as const;
export type CampStatus = (typeof CAMP_STATUSES)[number];

export const GENDERS = ["male", "female"] as const;
export type Gender = (typeof GENDERS)[number];

export const STAFF_ROLES = ["admin", "coordinator", "leader"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export type ScopeKind = "fellowship" | "pfcc";

export type Camp = {
  id: string;
  created_at: string;
  name: string;
  slug: string;
  venue: string;
  starts_on: string;
  ends_on: string;
  registration_opens_on: string;
  registration_closes_on: string;
  payment_due_on: string;
  roommate_deadline_on: string;
  /** Paystack's fee, passed on to attendees, in basis points (195 = 1.95%). */
  fee_bps: number;
  status: CampStatus;
  /** Images on R2 (media.theairportcitychurch.com), each with its credit line. Empty means none. */
  logo_url: string;
  logo_credit: string;
  banner_url: string;
  banner_credit: string;
  venue_photo_url: string;
  venue_photo_credit: string;
};

/** logo: beside the back button and in the sidebar · banner: the wide image up top · venue_photo: "Where we'll be". */
export const CAMP_PHOTOS = ["logo", "banner", "venue_photo"] as const;
export type CampPhoto = (typeof CAMP_PHOTOS)[number];

/** What a coordinator fills in; id, slug and created_at are set on save. */
export type CampInput = Omit<Camp, "id" | "created_at" | "slug" | `${CampPhoto}_url` | `${CampPhoto}_credit`>;

export type RoomType = {
  id: string;
  camp_id: string;
  name: string;
  price_pesewas: number;
  capacity: number;
  /** Places left for each gender, as last told by the venue. null = no limit, 0 = full. */
  places_male: number | null;
  places_female: number | null;
};

export type Room = {
  id: string;
  camp_id: string;
  room_type_id: string;
  room_type_name: string;
  label: string;
  gender: Gender;
  capacity: number;
  /** People placed in it. */
  occupied: number;
};

export type RoomInput = Pick<Room, "room_type_id" | "label" | "gender" | "capacity">;

export type Staff = {
  email: string;
  role: StaffRole;
  scope_kind: ScopeKind | null;
  scope_value: string | null;
};

/** A user-facing validation problem, safe to show as-is. */
export class CampError extends Error {}

export const REGISTRATION_STATUSES = ["registered", "partially_paid", "fully_paid", "cancelled"] as const;
export type RegistrationStatus = (typeof REGISTRATION_STATUSES)[number];

export const REGISTRATION_STATUS_LABELS: Record<RegistrationStatus, string> = {
  registered: "Nothing paid",
  partially_paid: "Part paid",
  fully_paid: "Fully paid",
  cancelled: "Cancelled",
};

export const SHIRT_SIZES = ["S", "M", "L", "XL", "2XL", "3XL", "4XL"] as const;
export type ShirtSize = (typeof SHIRT_SIZES)[number];

export type Registration = {
  id: string;
  created_at: string;
  camp_id: string;
  room_type_id: string;
  room_type_name: string;
  full_name: string;
  phone: string;
  email: string;
  gender: Gender;
  fellowship: string;
  pfcc: string;
  church: string;
  price_pesewas: number;
  paid_pesewas: number;
  status: RegistrationStatus;
  shirt_size: ShirtSize | "";
  /** "I'm happy with any room": no roommate group, a coordinator places them. */
  any_room: 0 | 1;
  checked_in_at: string | null;
};

/** What an attendee types in; PFCC comes from the fellowship. */
export type RegistrationInput = {
  full_name: string;
  phone: string;
  email: string;
  gender: Gender;
  fellowship: string;
  church: string;
  room_type_id: string;
  shirt_size?: ShirtSize | "";
};

/** Details an attendee can change themselves. Phone, gender and fellowship are a coordinator's. */
export type ProfileInput = {
  full_name: string;
  email: string;
  shirt_size: ShirtSize | "";
  emergency_name: string;
  emergency_phone: string;
  health_notes: string;
};

/** Emergency contact and health notes: shown to the attendee and coordinators only. */
export type PrivateDetails = Pick<ProfileInput, "emergency_name" | "emergency_phone" | "health_notes">;

export type RequestKind = "refund" | "room_change";
export type RequestStatus = "pending" | "approved" | "declined" | "withdrawn";

export type CampRequest = {
  id: string;
  created_at: string;
  camp_id: string;
  registration_id: string;
  full_name: string;
  fellowship: string;
  room_type_name: string;
  kind: RequestKind;
  status: RequestStatus;
  amount_pesewas: number | null;
  to_room_type_id: string | null;
  to_room_type_name: string | null;
  to_price_pesewas: number | null;
  price_pesewas: number;
  paid_pesewas: number;
  registration_status: RegistrationStatus;
  reason: string;
  requested_by: string;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string;
};

export type PaymentStatus = "pending" | "success" | "failed";

export type Payment = {
  id: string;
  created_at: string;
  registration_id: string;
  reference: string;
  amount_pesewas: number;
  fee_pesewas: number;
  charged_pesewas: number;
  status: PaymentStatus;
  flag: string | null;
  paid_at: string | null;
  /** Set when a coordinator paid for several people at once. */
  bulk_id: string | null;
  /** Who paid through a pay link, or the coordinator's note on a bulk payment. */
  payer_name: string;
};

/** open: anyone eligible can join; locked: by its owner, who can unlock; final: the roommate deadline has passed. */
export type GroupState = "open" | "locked" | "final";

export const GROUP_STATE_LABELS: Record<GroupState, string> = {
  open: "Open",
  locked: "Locked",
  final: "Final",
};

export type GroupMember = {
  registration_id: string;
  full_name: string;
  fellowship: string;
  joined_at: string;
};

export type Group = {
  id: string;
  camp_id: string;
  room_type_id: string;
  room_type_name: string;
  gender: Gender;
  code: string;
  owner_registration_id: string;
  locked_at: string | null;
  capacity: number;
  roommate_deadline_on: string;
  state: GroupState;
  /** Longest-standing first; the owner is usually first. */
  members: GroupMember[];
};

/** An invite as its invitee sees it. */
export type ReceivedInvite = {
  id: string;
  created_at: string;
  group_id: string;
  owner_name: string;
  member_count: number;
  capacity: number;
};

/** An invite as the group's owner sees it. */
export type SentInvite = {
  id: string;
  created_at: string;
  registration_id: string;
  full_name: string;
  fellowship: string;
};

/** Name-search result: only what an owner needs to pick the right person. */
export type Invitee = {
  id: string;
  full_name: string;
  fellowship: string;
  invited: number;
};

export type Occupant = {
  registration_id: string;
  full_name: string;
  fellowship: string;
  group_code: string | null;
  /** Arrived at camp (checked in). */
  checked_in: 0 | 1;
};

export type RoomWithOccupants = Room & { occupants: Occupant[] };

/** One gender and room type: everyone in it can share any of its rooms. */
export type Pool = {
  room_type_id: string;
  room_type_name: string;
  gender: Gender;
  fully_paid: number;
  assigned: number;
  beds: number;
};

export type WaitingGroup = {
  id: string;
  code: string;
  state: GroupState;
  capacity: number;
  members: (GroupMember & { room_label: string | null })[];
};

export type WaitingPerson = { id: string; full_name: string; fellowship: string; any_room: 0 | 1 };

/** What an attendee sees once placed. */
export type MyRoom = { label: string; room_type_name: string; roommates: string[] };
