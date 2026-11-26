import { formatCedis } from "./money";

/** Why someone can't have a T-shirt yet. Shared by the server and the scanning phone (with no signal). */
export const shirtRefusal = (name: string, outstandingPesewas: number) =>
  `No T-shirt yet: ${name.split(" ")[0]} still has ${formatCedis(outstandingPesewas)} outstanding. T-shirts are for people who've paid in full.`;

/** Why someone can't be checked in yet: only people who've paid in full are. Shared by the server and the scanning phone (with no signal). */
export const checkInRefusal = (name: string, outstandingPesewas: number) =>
  `Can't check ${name.split(" ")[0]} in yet: ${formatCedis(outstandingPesewas)} is still outstanding. Only people who've paid in full can check in.`;
