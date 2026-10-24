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
};

/** What a coordinator fills in; id, slug and created_at are set on save. */
export type CampInput = Omit<Camp, "id" | "created_at" | "slug">;

export type RoomType = {
  id: string;
  camp_id: string;
  name: string;
  price_pesewas: number;
  capacity: number;
};

export type Room = {
  id: string;
  camp_id: string;
  room_type_id: string;
  room_type_name: string;
  label: string;
  gender: Gender;
  capacity: number;
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
  registered: "Registered",
  partially_paid: "Partially paid",
  fully_paid: "Fully paid",
  cancelled: "Cancelled",
};

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
