/**
 * Canonical TACC fellowships, shared by soul winning and camp. PFCC is
 * derived from the fellowship — members never type it.
 */

export type Pfcc = "PFCC 1" | "PFCC 2" | "Children's Church";

/** Groups sit between PFCC and fellowship (PFCC → group → fellowship). Each has a Group Leader. */
export const GROUPS = ["Pastor's Group", "Group 1", "Group 2", "Group 3", "Group 4"] as const;
export type Group = (typeof GROUPS)[number];

export type Fellowship = {
  name: string;
  pfcc: Pfcc;
  /** Null: not in a group (Children's Church). */
  group: Group | null;
};

/** Keep the order leaders listed them in, grouped by PFCC, then by group. */
export const FELLOWSHIPS: Fellowship[] = [
  // PFCC 1 · Pastor's Group
  { name: "Empowered", pfcc: "PFCC 1", group: "Pastor's Group" },
  { name: "Increase", pfcc: "PFCC 1", group: "Pastor's Group" },
  { name: "City of David", pfcc: "PFCC 1", group: "Pastor's Group" },
  { name: "Campus", pfcc: "PFCC 1", group: "Pastor's Group" },
  { name: "Hand of God", pfcc: "PFCC 1", group: "Pastor's Group" },
  { name: "Light", pfcc: "PFCC 1", group: "Pastor's Group" },
  { name: "Online Fellowship", pfcc: "PFCC 1", group: "Pastor's Group" },
  { name: "Pastor's Fellowship", pfcc: "PFCC 1", group: "Pastor's Group" },
  // PFCC 1 · Group 1
  { name: "Chosen", pfcc: "PFCC 1", group: "Group 1" },
  { name: "Royalties", pfcc: "PFCC 1", group: "Group 1" },
  { name: "Ecclesia", pfcc: "PFCC 1", group: "Group 1" },
  // PFCC 1 · Group 2
  { name: "Higher Achievers", pfcc: "PFCC 1", group: "Group 2" },
  { name: "Enthroned", pfcc: "PFCC 1", group: "Group 2" },
  { name: "Blessed Land", pfcc: "PFCC 1", group: "Group 2" },
  { name: "Rabah", pfcc: "PFCC 1", group: "Group 2" },
  // PFCC 2 · Group 3
  { name: "Radah", pfcc: "PFCC 2", group: "Group 3" },
  { name: "Chara", pfcc: "PFCC 2", group: "Group 3" },
  { name: "Excellence", pfcc: "PFCC 2", group: "Group 3" },
  { name: "Qadash", pfcc: "PFCC 2", group: "Group 3" },
  { name: "Theios", pfcc: "PFCC 2", group: "Group 3" },
  { name: "Mothers", pfcc: "PFCC 2", group: "Group 3" },
  // PFCC 2 · Group 4
  { name: "Auxano", pfcc: "PFCC 2", group: "Group 4" },
  { name: "Executives", pfcc: "PFCC 2", group: "Group 4" },
  { name: "Ever Increasing", pfcc: "PFCC 2", group: "Group 4" },
  { name: "Fire", pfcc: "PFCC 2", group: "Group 4" },
  { name: "Rhema", pfcc: "PFCC 2", group: "Group 4" },
  { name: "Strategic", pfcc: "PFCC 2", group: "Group 4" },
  { name: "Legal Outreach", pfcc: "PFCC 2", group: "Group 4" },
  // Children's Church: a PFCC of its own, no group.
  { name: "Children's Church", pfcc: "Children's Church", group: null },
];

export function groupForFellowship(name: string): Group | null {
  return FELLOWSHIPS.find((row) => row.name === name)?.group ?? null;
}

export function fellowshipsInGroup(group: string): string[] {
  return FELLOWSHIPS.filter((row) => row.group === group).map((row) => row.name);
}

export const isGroup = (value: string): value is Group => (GROUPS as readonly string[]).includes(value);

export const PFCC_GROUPS: { pfcc: Pfcc; fellowships: Fellowship[] }[] = (
  ["PFCC 1", "PFCC 2", "Children's Church"] as const
).map((pfcc) => ({
  pfcc,
  fellowships: FELLOWSHIPS.filter((row) => row.pfcc === pfcc),
}));

export function pfccForFellowship(name: string): Pfcc | null {
  return FELLOWSHIPS.find((row) => row.name === name)?.pfcc ?? null;
}

/** Churches a camp attendee can belong to. Just TACC for now; branches can be added here. */
export const CHURCHES = ["TACC"] as const;
export type Church = (typeof CHURCHES)[number];

export const PFCCS: Pfcc[] = PFCC_GROUPS.map((group) => group.pfcc);
