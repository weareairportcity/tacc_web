/** Canonical fellowships for 1909. PFCC is derived — members never type it. */

export type Pfcc = "PFCC 1" | "PFCC 2";

export type Fellowship = {
  name: string;
  pfcc: Pfcc;
};

/** Keep the order leaders listed them in, grouped by PFCC. */
export const FELLOWSHIPS: Fellowship[] = [
  // PFCC 1
  { name: "Chosen", pfcc: "PFCC 1" },
  { name: "Royalties", pfcc: "PFCC 1" },
  { name: "Ecclesia", pfcc: "PFCC 1" },
  { name: "Higher Achievers", pfcc: "PFCC 1" },
  { name: "Blessed Land", pfcc: "PFCC 1" },
  { name: "Enthroned", pfcc: "PFCC 1" },
  { name: "Rabah", pfcc: "PFCC 1" },
  { name: "Hand of God", pfcc: "PFCC 1" },
  { name: "Light", pfcc: "PFCC 1" },
  { name: "Empowered", pfcc: "PFCC 1" },
  { name: "City of David", pfcc: "PFCC 1" },
  { name: "Increase", pfcc: "PFCC 1" },
  { name: "Campus", pfcc: "PFCC 1" },
  // PFCC 2
  { name: "Radah", pfcc: "PFCC 2" },
  { name: "Chara", pfcc: "PFCC 2" },
  { name: "Excellence", pfcc: "PFCC 2" },
  { name: "Fruitful", pfcc: "PFCC 2" },
  { name: "Theios", pfcc: "PFCC 2" },
  { name: "Qadash", pfcc: "PFCC 2" },
  { name: "Mothers", pfcc: "PFCC 2" },
  { name: "Auxano", pfcc: "PFCC 2" },
  { name: "Ever Increasing", pfcc: "PFCC 2" },
  { name: "Executives", pfcc: "PFCC 2" },
  { name: "Fire", pfcc: "PFCC 2" },
  { name: "Legal Outreach", pfcc: "PFCC 2" },
  { name: "Rhema", pfcc: "PFCC 2" },
  { name: "Strategic", pfcc: "PFCC 2" },
];

export const PFCC_GROUPS: { pfcc: Pfcc; fellowships: Fellowship[] }[] = (
  ["PFCC 1", "PFCC 2"] as const
).map((pfcc) => ({
  pfcc,
  fellowships: FELLOWSHIPS.filter((row) => row.pfcc === pfcc),
}));

export function pfccForFellowship(name: string): Pfcc | null {
  return FELLOWSHIPS.find((row) => row.name === name)?.pfcc ?? null;
}
