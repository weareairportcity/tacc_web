/** Plain words for the audit log's action codes, for History. */
export const ACTION_WORDS: Record<string, string> = {
  "camp.create": "created the camp",
  "camp.update": "edited the camp",
  "camp.photo": "changed a camp photo",
  "registration.create": "registered",
  "registration.cancel": "cancelled a registration",
  "registration.code_reset": "asked for a new sign-in code",
  "registration.refund": "refunded",
  "registration.room_type_change": "changed room type",
  "registration.profile": "updated details",
  "registration.any_room": "chose any room",
  "registration.choose_room": "chose to pick roommates",
  "registration.check_in": "checked in",
  "registration.check_in_undo": "undid a check-in",
  "registration.shirt_given": "gave out a T-shirt",
  "registration.shirt_given_undo": "took back a T-shirt",
  "leader.sign_in": "signed in",
  "leader.sign_out": "signed out",
  "leader_code.create": "made a leader code",
  "leader_code.off": "turned off a leader code",
  "people.export": "downloaded the people list",
  "view.save": "saved a People view",
  "view.delete": "removed a People view",
  "registration.delete_details": "deleted their details",
  "request.refund": "asked for a refund",
  "request.room_change": "asked to change room type",
  "request.withdraw": "withdrew a request",
  "request.approve": "approved a request",
  "request.decline": "declined a request",
  "payment.success": "confirmed a payment",
  "payment.bulk_success": "confirmed a payment for several people",
  "payment.flagged": "flagged a payment to check",
  "people.text": "texted people",
  "group.create": "started a roommate group",
  "group.invite": "invited someone to a group",
  "group.invite_cancel": "withdrew an invite",
  "group.invite_decline": "declined an invite",
  "group.join": "joined a group",
  "group.leave": "left a group",
  "group.remove": "removed someone from a group",
  "group.lock": "locked a group",
  "group.unlock": "unlocked a group",
  "room.assign": "placed someone in a room",
  "room.assign_group": "placed a group in a room",
  "room.unassign": "took someone out of a room",
  "room.create": "added a room",
  "room.update": "edited a room",
  "room.delete": "deleted a room",
  "room.import": "imported rooms",
  "room.sms": "texted people their rooms",
  "room_type.create": "added a room type",
  "room_type.update": "edited a room type",
  "room_type.delete": "deleted a room type",
  "room_type.places_left": "updated places left",
};

export const actorName = (actor: string, person: string | null) =>
  actor.startsWith("attendee:")
    ? (person ?? "An attendee")
    : actor.startsWith("leader:")
      ? `${actor.split(":").slice(2).join(":")} leader`
      : actor === "paystack"
        ? "Paystack"
        : actor.startsWith("system")
          ? "Commune"
          : actor.split("@")[0];

export const describeAction = (action: string) => ACTION_WORDS[action] ?? action.replace(/[._]/g, " ");
