import { formatCedis } from "./money";

/** Why someone can't have a T-shirt yet. Shared by the server and the scanning phone (with no signal). */
export const shirtRefusal = (name: string, outstandingPesewas: number) =>
  `No T-shirt yet: ${name.split(" ")[0]} still has ${formatCedis(outstandingPesewas)} outstanding. T-shirts are for people who've paid in full.`;
