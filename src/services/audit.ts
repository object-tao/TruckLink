import type { User } from "../api/types";
export function audit(
  db: D1Database,
  user: User,
  module: string,
  id: string,
  action: string,
  before: unknown,
  after: unknown,
  ip: string | null,
  conditional = false,
) {
  return db
    .prepare(
      "INSERT INTO audit_logs(id,operator_type,operator_id,module,object_type,object_id,action,before_data,after_data,ip_address) SELECT ?,?,?,?,?,?,?,?,?,?" +
        (conditional ? " WHERE changes()>0" : ""),
    )
    .bind(
      crypto.randomUUID(),
      user.role,
      user.id,
      module,
      module,
      id,
      action,
      before == null ? null : JSON.stringify(before),
      after == null ? null : JSON.stringify(after),
      ip,
    );
}
