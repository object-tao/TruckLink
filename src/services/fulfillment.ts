import { Problem, type User } from "../api/types";
import { audit } from "./audit";
import { hash } from "./auth";
import {
  assignmentReviewSchema,
  assignmentSchema,
  driverCreateSchema,
  reviewSchema,
  transportEventSchema,
  vehicleCreateSchema,
} from "./validation";

const nowSql = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
export const taskDetailSql = `SELECT t.*,o.order_no,o.carrier_id,o.route_snapshot,o.vehicle_type_id,o.vehicle_type_snapshot,o.status AS order_status,o.loading_address,o.loading_contact,o.loading_phone,o.unloading_address,o.unloading_contact,o.unloading_phone,o.cargo_name,o.cargo_weight_kg,o.cargo_quantity,o.cargo_length_cm,o.cargo_width_cm,o.cargo_height_cm,v.plate_number,d.name AS driver_name,d.phone AS driver_phone,datetime(t.planned_loading_date,'-2 days') AS assignment_due_at FROM order_tasks t JOIN orders o ON o.id=t.order_id LEFT JOIN vehicles v ON v.id=t.vehicle_id LEFT JOIN drivers d ON d.id=t.driver_id`;

export function carrierOrder(row: Record<string, unknown>) {
  const {
    customer_company_id,
    customer_user_id,
    service_fee_snapshot,
    customer_unit_price_snapshot,
    total_amount_cents,
    deposit_rate_snapshot,
    deposit_amount_cents,
    balance_amount_cents,
    request_hash,
    idempotency_key,
    ...safe
  } = row;
  return {
    ...safe,
    carrier_total_cents:
      Number(row.carrier_unit_price_snapshot) * Number(row.vehicle_count),
  };
}

export async function createVehicle(
  db: D1Database,
  user: User,
  input: unknown,
  ip: string | null,
) {
  if (!user.carrier_id) throw new Problem(409, "请先完成车队入驻");
  const data = vehicleCreateSchema.parse(input);
  const id = crypto.randomUUID();
  const valid = await db
    .prepare(
      "SELECT ca.id FROM carriers ca,vehicle_types vt,countries co WHERE ca.id=? AND ca.status='ACTIVE' AND vt.id=? AND vt.status='ACTIVE' AND co.id=?",
    )
    .bind(user.carrier_id, data.vehicle_type_id, data.country_id)
    .first();
  if (!valid) throw new Problem(409, "车队、车型或国家当前不可用");
  await db.batch([
    db
      .prepare(
        "INSERT INTO vehicles(id,carrier_id,plate_number,country_id,vehicle_type_id,created_by) VALUES(?,?,?,?,?,?)",
      )
      .bind(
        id,
        user.carrier_id,
        data.plate_number.toUpperCase(),
        data.country_id,
        data.vehicle_type_id,
        user.id,
      ),
    audit(db, user, "Vehicle", id, "SUBMIT", null, data, ip),
  ]);
  return { id, status: "PENDING_REVIEW" };
}
export async function createDriver(
  db: D1Database,
  user: User,
  input: unknown,
  ip: string | null,
) {
  if (!user.carrier_id) throw new Problem(409, "请先完成车队入驻");
  const data = driverCreateSchema.parse(input);
  const id = crypto.randomUUID();
  const active = await db
    .prepare("SELECT id FROM carriers WHERE id=? AND status='ACTIVE'")
    .bind(user.carrier_id)
    .first();
  if (!active) throw new Problem(403, "车队审核通过后才能新增司机");
  await db.batch([
    db
      .prepare(
        "INSERT INTO drivers(id,carrier_id,name,phone,id_number,created_by) VALUES(?,?,?,?,?,?)",
      )
      .bind(
        id,
        user.carrier_id,
        data.name,
        data.phone,
        data.id_number,
        user.id,
      ),
    audit(
      db,
      user,
      "Driver",
      id,
      "CREATE",
      null,
      { name: data.name, phone: data.phone },
      ip,
    ),
  ]);
  return { id, status: "ACTIVE" };
}
export async function reviewVehicle(
  db: D1Database,
  user: User,
  id: string,
  input: unknown,
  ip: string | null,
) {
  const data = reviewSchema.parse(input);
  const before = await db
    .prepare("SELECT * FROM vehicles WHERE id=?")
    .bind(id)
    .first<Record<string, any>>();
  if (!before) throw new Problem(404, "车辆不存在");
  if (before.status !== "PENDING_REVIEW")
    throw new Problem(409, "车辆已审核，请刷新");
  const status = data.decision === "APPROVE" ? "ACTIVE" : "REJECTED";
  const result = await db.batch([
    db
      .prepare(
        `UPDATE vehicles SET status=?,review_reason=?,reviewed_by=?,reviewed_at=${nowSql},updated_at=${nowSql} WHERE id=? AND status='PENDING_REVIEW' RETURNING id,status`,
      )
      .bind(status, data.reason, user.id, id),
    audit(
      db,
      user,
      "Vehicle",
      id,
      data.decision,
      before,
      { status, reason: data.reason },
      ip,
      true,
    ),
  ]);
  if (!result[0].results.length) throw new Problem(409, "车辆已被其他人审核");
  return result[0].results[0];
}
export async function confirmCarrierOrder(
  db: D1Database,
  user: User,
  id: string,
  ip: string | null,
) {
  if (!user.carrier_id) throw new Problem(403, "未关联车队");
  const before = await db
    .prepare(
      "SELECT id,order_no,status FROM orders WHERE id=? AND carrier_id=?",
    )
    .bind(id, user.carrier_id)
    .first<Record<string, any>>();
  if (!before) throw new Problem(404, "订单不存在");
  if (before.status !== "CARRIER_CONFIRM_PENDING")
    throw new Problem(409, "订单尚未进入车队确认阶段或已处理");
  const results = await db.batch([
    db
      .prepare(
        `UPDATE orders SET status='VEHICLE_ASSIGN_PENDING',carrier_confirmed_by=?,carrier_confirmed_at=${nowSql},updated_at=${nowSql} WHERE id=? AND carrier_id=? AND status='CARRIER_CONFIRM_PENDING' RETURNING id,status`,
      )
      .bind(user.id, id, user.carrier_id),
    db
      .prepare(
        `UPDATE order_tasks SET status='VEHICLE_ASSIGN_PENDING',updated_at=${nowSql} WHERE order_id=? AND status IN ('AWAITING_DEPOSIT','CARRIER_CONFIRM_PENDING')`,
      )
      .bind(id),
    audit(
      db,
      user,
      "Order",
      id,
      "CARRIER_CONFIRM",
      before,
      { status: "VEHICLE_ASSIGN_PENDING" },
      ip,
      true,
    ),
  ]);
  if (!results[0].results.length) throw new Problem(409, "订单已由其他人处理");
  return results[0].results[0];
}
export async function assignTask(
  db: D1Database,
  user: User,
  id: string,
  input: unknown,
  ip: string | null,
) {
  if (!user.carrier_id) throw new Problem(403, "未关联车队");
  const data = assignmentSchema.parse(input);
  const before = await db
    .prepare(`${taskDetailSql} WHERE t.id=? AND o.carrier_id=?`)
    .bind(id, user.carrier_id)
    .first<Record<string, any>>();
  if (!before) throw new Problem(404, "任务不存在");
  if (
    ![
      "VEHICLE_ASSIGN_PENDING",
      "VEHICLE_REVIEW_PENDING",
      "READY_FOR_LOADING",
    ].includes(before.status)
  )
    throw new Problem(409, "任务当前不能绑定或更换车辆");
  const resource = await db
    .prepare(
      `SELECT v.id,v.status,v.vehicle_type_id,d.id AS driver_id,d.status AS driver_status FROM vehicles v JOIN drivers d ON d.id=? AND d.carrier_id=v.carrier_id WHERE v.id=? AND v.carrier_id=?`,
    )
    .bind(data.driver_id, data.vehicle_id, user.carrier_id)
    .first<Record<string, any>>();
  if (
    !resource ||
    !["PENDING_REVIEW", "ACTIVE"].includes(resource.status) ||
    resource.driver_status !== "ACTIVE"
  )
    throw new Problem(409, "车辆或司机不可用");
  if (resource.vehicle_type_id !== before.vehicle_type_id)
    throw new Problem(400, "车辆车型与订单不一致");
  const version = Number(before.assignment_version) + 1;
  const results = await db.batch([
    db
      .prepare(
        `UPDATE order_tasks SET vehicle_id=?,driver_id=?,status='VEHICLE_REVIEW_PENDING',assignment_version=?,assigned_at=${nowSql},assignment_reviewed_by=NULL,assignment_reviewed_at=NULL,assignment_review_reason=NULL,updated_at=${nowSql} WHERE id=? AND assignment_version=? RETURNING id,status,assignment_version`,
      )
      .bind(
        data.vehicle_id,
        data.driver_id,
        version,
        id,
        before.assignment_version,
      ),
    db
      .prepare(
        `UPDATE orders SET status='VEHICLE_REVIEW_PENDING',updated_at=${nowSql} WHERE id=? AND status IN ('VEHICLE_ASSIGN_PENDING','VEHICLE_REVIEW_PENDING','READY_FOR_LOADING')`,
      )
      .bind(before.order_id),
    audit(
      db,
      user,
      "OrderTask",
      id,
      before.vehicle_id ? "REASSIGN" : "ASSIGN",
      before,
      {
        ...data,
        status: "VEHICLE_REVIEW_PENDING",
        assignment_version: version,
      },
      ip,
      true,
    ),
  ]);
  if (!results[0].results.length)
    throw new Problem(409, "任务分配已变化，请刷新");
  return results[0].results[0];
}
export async function reviewAssignment(
  db: D1Database,
  user: User,
  id: string,
  input: unknown,
  ip: string | null,
) {
  const data = assignmentReviewSchema.parse(input);
  const before = await db
    .prepare(`${taskDetailSql} WHERE t.id=?`)
    .bind(id)
    .first<Record<string, any>>();
  if (!before) throw new Problem(404, "任务不存在");
  if (before.status !== "VEHICLE_REVIEW_PENDING")
    throw new Problem(409, "任务不在车辆审核状态");
  if (data.decision === "APPROVE") {
    const active = await db
      .prepare("SELECT id FROM vehicles WHERE id=? AND status='ACTIVE'")
      .bind(before.vehicle_id)
      .first();
    if (!active) throw new Problem(409, "请先完成车辆资质审核");
  }
  const status =
    data.decision === "APPROVE"
      ? "READY_FOR_LOADING"
      : "VEHICLE_ASSIGN_PENDING";
  const statements = [
    db
      .prepare(
        `UPDATE order_tasks SET status=?,assignment_reviewed_by=?,assignment_reviewed_at=${nowSql},assignment_review_reason=?,updated_at=${nowSql} WHERE id=? AND status='VEHICLE_REVIEW_PENDING' AND assignment_version=? RETURNING id,status`,
      )
      .bind(status, user.id, data.reason, id, before.assignment_version),
    audit(
      db,
      user,
      "OrderTask",
      id,
      `ASSIGNMENT_${data.decision}`,
      before,
      { status, reason: data.reason },
      ip,
      true,
    ),
  ];
  if (data.decision === "APPROVE")
    statements.push(
      db
        .prepare(
          `UPDATE orders SET status='READY_FOR_LOADING',updated_at=${nowSql} WHERE id=? AND status IN ('VEHICLE_REVIEW_PENDING','VEHICLE_ASSIGN_PENDING') AND NOT EXISTS(SELECT 1 FROM order_tasks WHERE order_id=? AND status<>'READY_FOR_LOADING')`,
        )
        .bind(before.order_id, before.order_id),
    );
  else
    statements.push(
      db
        .prepare(
          `UPDATE orders SET status='VEHICLE_ASSIGN_PENDING',updated_at=${nowSql} WHERE id=?`,
        )
        .bind(before.order_id),
    );
  const results = await db.batch(statements);
  if (!results[0].results.length) throw new Problem(409, "任务已由其他人审核");
  return results[0].results[0];
}
export async function addTransportEvent(
  db: D1Database,
  user: User,
  id: string,
  input: unknown,
  key: string | null,
  ip: string | null,
) {
  if (!key || !/^[a-zA-Z0-9_-]{8,100}$/.test(key))
    throw new Problem(400, "请提供有效的 Idempotency-Key");
  const data = transportEventSchema.parse(input);
  const requestHash = await hash(JSON.stringify(data));
  const prior = async () =>
    db
      .prepare(
        "SELECT id,event_type,request_hash FROM transport_events WHERE operator_id=? AND idempotency_key=?",
      )
      .bind(user.id, key)
      .first<Record<string, any>>();
  const existing = await prior();
  if (existing) {
    if (existing.request_hash !== requestHash)
      throw new Problem(409, "同一幂等键不能用于不同运输事件");
    return { ...existing, replayed: true };
  }
  const scope = user.role === "CARRIER" ? "AND o.carrier_id=?" : "AND ?<>''";
  const task = await db
    .prepare(`${taskDetailSql} WHERE t.id=? ${scope}`)
    .bind(id, user.role === "CARRIER" ? (user.carrier_id ?? "") : "platform")
    .first<Record<string, any>>();
  if (!task) throw new Problem(404, "任务不存在");
  const transit = data.event_type !== "LOADED";
  if (
    (!transit && task.status !== "READY_FOR_LOADING") ||
    (transit && !["LOADED", "IN_TRANSIT"].includes(task.status))
  )
    throw new Problem(409, "运输事件与任务当前状态不匹配");
  const nextStatus = transit ? "IN_TRANSIT" : "LOADED";
  const eventId = crypto.randomUUID();
  const statements = [
    db
      .prepare(
        "INSERT INTO transport_events(id,order_task_id,event_type,event_time,country_id,city_id,location_text,remark,operator_type,operator_id,idempotency_key,request_hash) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
      )
      .bind(
        eventId,
        id,
        data.event_type,
        data.event_time,
        data.country_id ?? null,
        data.city_id ?? null,
        data.location_text,
        data.remark,
        user.role,
        user.id,
        key,
        requestHash,
      ),
    db
      .prepare(
        `UPDATE order_tasks SET status=?,${transit ? "departed_at=COALESCE(departed_at,?)," : "loaded_at=COALESCE(loaded_at,?),"}updated_at=${nowSql} WHERE id=? AND status=?`,
      )
      .bind(nextStatus, data.event_time, id, task.status),
    audit(
      db,
      user,
      "TransportEvent",
      eventId,
      "CREATE",
      null,
      { task_id: id, ...data },
      ip,
      true,
    ),
  ];
  if (transit)
    statements.push(
      db
        .prepare(
          `UPDATE orders SET status='IN_TRANSIT',updated_at=${nowSql} WHERE id=? AND status IN ('LOADED','IN_TRANSIT') AND NOT EXISTS(SELECT 1 FROM order_tasks WHERE order_id=? AND status<>'IN_TRANSIT')`,
        )
        .bind(task.order_id, task.order_id),
    );
  else
    statements.push(
      db
        .prepare(
          `UPDATE orders SET status='LOADED',updated_at=${nowSql} WHERE id=? AND status IN ('READY_FOR_LOADING','LOADED') AND NOT EXISTS(SELECT 1 FROM order_tasks WHERE order_id=? AND status NOT IN ('LOADED','IN_TRANSIT'))`,
        )
        .bind(task.order_id, task.order_id),
    );
  try {
    await db.batch(statements);
  } catch (error) {
    const winner = await prior();
    if (winner) {
      if (winner.request_hash !== requestHash)
        throw new Problem(409, "同一幂等键不能用于不同运输事件");
      return { ...winner, replayed: true };
    }
    throw error;
  }
  return { id: eventId, event_type: data.event_type, replayed: false };
}
