/**
 * Audit entries ride in the same D1 batch as the change they describe, so a
 * change is never saved without its entry (or the other way round).
 */
export function auditStatement(entry: {
  actor: string;
  campId: string | null;
  action: string;
  entity: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
}) {
  return {
    sql: `INSERT INTO camp_audit_log (camp_id, actor, action, entity, entity_id, before_json, after_json)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    params: [
      entry.campId,
      entry.actor,
      entry.action,
      entry.entity,
      entry.entityId,
      entry.before === undefined ? null : JSON.stringify(entry.before),
      entry.after === undefined ? null : JSON.stringify(entry.after),
    ],
  };
}

export type AuditEntry = {
  id: number;
  created_at: string;
  actor: string;
  action: string;
  entity: string;
  entity_id: string;
};
