import { fellowshipsInGroup, groupForFellowship } from "@/lib/fellowships";

/**
 * Who a leader looks after: one fellowship, one PFCC, or one group (PFCC →
 * group → fellowship). A group isn't stored on a registration; it comes from
 * the fellowship name (src/lib/fellowships.ts), so existing rows need no change.
 */
export type Scope = { kind: "all" } | { kind: "fellowship" | "pfcc" | "group"; value: string };

/** The WHERE clause (on alias r) that keeps a query inside the scope. */
export function scopeSql(scope: Scope): { sql: string; params: unknown[] } {
  if (scope.kind === "all") return { sql: "", params: [] };
  if (scope.kind === "group") {
    const names = fellowshipsInGroup(scope.value);
    // An unknown group matches nobody, never everybody.
    if (!names.length) return { sql: " AND 0", params: [] };
    return { sql: ` AND r.fellowship IN (${names.map(() => "?").join(",")})`, params: names };
  }
  return { sql: ` AND r.${scope.kind === "fellowship" ? "fellowship" : "pfcc"} = ?`, params: [scope.value] };
}

/** The same rule, for one person already in hand. */
export function inScope(p: { fellowship: string; pfcc: string }, scope: Scope) {
  if (scope.kind === "all") return true;
  if (scope.kind === "group") return groupForFellowship(p.fellowship) === scope.value;
  return (scope.kind === "fellowship" ? p.fellowship : p.pfcc) === scope.value;
}
