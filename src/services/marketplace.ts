import { Problem, type User } from "../api/types";
import { audit } from "./audit";
import { offerSchema, reviewSchema, orderSchema } from "./validation";
import { hash } from "./auth";

export const offerJoin = `FROM capacity_offers c JOIN carriers ca ON ca.id=c.carrier_id JOIN routes r ON r.id=c.route_id JOIN cities oc ON oc.id=r.origin_city_id JOIN cities dc ON dc.id=r.destination_city_id JOIN vehicle_types v ON v.id=c.vehicle_type_id`;
const publicOffer = `c.id,c.offer_no,c.route_id,c.vehicle_type_id,c.loading_date,c.remaining_capacity,c.transit_days_min,c.transit_days_max,c.valid_until,c.status,r.route_code,oc.name AS origin_city,dc.name AS destination_city,v.name AS vehicle_type,v.category AS vehicle_category,v.model_name AS vehicle_model,v.line_count,v.axle_count,v.effective_length_text,v.effective_volume_m3,v.dimension_limits_complete,v.max_weight_kg,v.max_length_cm,v.max_width_cm,v.max_height_cm,(c.carrier_price_cents+r.service_fee_cents) AS customer_unit_price_cents,r.deposit_rate_bps`;
export const available = `c.status='AVAILABLE' AND c.remaining_capacity>0 AND c.valid_until>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND c.loading_date>=date('now') AND ca.status='ACTIVE' AND r.status='ACTIVE' AND v.status='ACTIVE'`;
export async function searchCapacity(
  db: D1Database,
  params: URLSearchParams,
  id?: string,
) {
  const conditions = [available];
  const args: string[] = [];
  for (const [key, column] of [
    ["route_id", "c.route_id"],
    ["vehicle_type_id", "c.vehicle_type_id"],
    ["loading_date", "c.loading_date"],
  ] as const) {
    const value = params.get(key);
    if (value) {
      conditions.push(`${column}=?`);
      args.push(value);
    }
  }
  if (id) {
    conditions.push("c.id=?");
    args.push(id);
  }
  return (
    await db
      .prepare(
        `SELECT ${publicOffer} ${offerJoin} WHERE ${conditions.join(" AND ")} ORDER BY c.loading_date,c.created_at DESC LIMIT 100`,
      )
      .bind(...args)
      .all()
  ).results;
}
export async function createOffer(
  db: D1Database,
  user: User,
  input: unknown,
  ip: string | null,
) {
  if (!user.carrier_id) throw new Problem(409, "请先完成车队入驻");
  const carrier = await db
    .prepare("SELECT status FROM carriers WHERE id=?")
    .bind(user.carrier_id)
    .first<{ status: string }>();
  if (carrier?.status !== "ACTIVE")
    throw new Problem(403, "车队审核通过后才能发布运力");
  const data = offerSchema.parse(input);
  const id = crypto.randomUUID();
  const no = `CAP${new Date().toISOString().slice(0, 10).replaceAll("-", "")}${id.slice(0, 8).toUpperCase()}`;
  const active = await db
    .prepare(
      "SELECT r.id FROM routes r,vehicle_types v WHERE r.id=? AND v.id=? AND r.status='ACTIVE' AND v.status='ACTIVE'",
    )
    .bind(data.route_id, data.vehicle_type_id)
    .first();
  if (!active) throw new Problem(409, "线路或车型当前不可用");
  await db.batch([
    db
      .prepare(
        `INSERT INTO capacity_offers(id,offer_no,carrier_id,route_id,vehicle_type_id,loading_date,carrier_price_cents,total_capacity,remaining_capacity,transit_days_min,transit_days_max,valid_until,status,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,'PENDING_REVIEW',?)`,
      )
      .bind(
        id,
        no,
        user.carrier_id,
        data.route_id,
        data.vehicle_type_id,
        data.loading_date,
        data.carrier_price_cents,
        data.total_capacity,
        data.total_capacity,
        data.transit_days_min,
        data.transit_days_max,
        data.valid_until,
        user.id,
      ),
    audit(db, user, "CapacityOffer", id, "SUBMIT", null, data, ip),
  ]);
  return { id, offer_no: no, status: "PENDING_REVIEW" };
}
export async function review(
  db: D1Database,
  user: User,
  kind: "CapacityOffer" | "Carrier",
  id: string,
  input: unknown,
  ip: string | null,
) {
  const data = reviewSchema.parse(input);
  const table = kind === "CapacityOffer" ? "capacity_offers" : "carriers";
  const before = await db
    .prepare(`SELECT * FROM ${table} WHERE id=?`)
    .bind(id)
    .first();
  if (!before) throw new Problem(404, "记录不存在");
  const pending = kind === "CapacityOffer" ? "PENDING_REVIEW" : "PENDING";
  if (before.status !== pending) throw new Problem(409, "该记录已处理，请刷新");
  if (kind === "CapacityOffer" && data.decision === "APPROVE") {
    const valid = await db
      .prepare(
        `SELECT c.id ${offerJoin} WHERE c.id=? AND ca.status='ACTIVE' AND r.status='ACTIVE' AND v.status='ACTIVE' AND c.valid_until>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND c.loading_date>=date('now')`,
      )
      .bind(id)
      .first();
    if (!valid) throw new Problem(409, "运力已过期或线路、车型、车队不可用");
  }
  const status =
    data.decision === "REJECT"
      ? "REJECTED"
      : kind === "Carrier"
        ? "ACTIVE"
        : "AVAILABLE";
  const update =
    kind === "Carrier"
      ? db
          .prepare(
            `UPDATE carriers SET status=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND status=? RETURNING id,status`,
          )
          .bind(status, id, pending)
      : db
          .prepare(
            `UPDATE capacity_offers SET status=?,approved_by=?,approved_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),review_reason=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND status=? RETURNING id,status`,
          )
          .bind(status, user.id, data.reason, id, pending);
  const result = await db.batch([
    update,
    audit(
      db,
      user,
      kind,
      id,
      data.decision,
      before,
      { status, reason: data.reason },
      ip,
      true,
    ),
  ]);
  if (!result[0].results.length) throw new Problem(409, "该记录已被其他人处理");
  return result[0].results[0];
}

// Only the initial transition is in M1; no controller accepts arbitrary order status.
export function initialOrderState() {
  return "PAYMENT_PENDING" as const;
}
export function customerOrder(row: Record<string, unknown>) {
  const {
    carrier_id,
    carrier_unit_price_snapshot,
    service_fee_snapshot,
    customer_user_id,
    request_hash,
    idempotency_key,
    ...safe
  } = row;
  return safe;
}
export async function createOrder(
  db: D1Database,
  user: User,
  input: unknown,
  key: string | null,
  ip: string | null,
) {
  if (!user.customer_company_id) throw new Problem(409, "请先完善客户企业信息");
  if (!key || !/^[a-zA-Z0-9_-]{8,100}$/.test(key))
    throw new Problem(400, "请提供有效的 Idempotency-Key");
  const data = orderSchema.parse(input);
  const requestHash = await hash(JSON.stringify(data));
  const existing = async () =>
    await db
      .prepare(
        "SELECT * FROM orders WHERE customer_user_id=? AND idempotency_key=?",
      )
      .bind(user.id, key)
      .first();
  const replay = (row: Record<string, unknown>) => {
    if (row.request_hash !== requestHash)
      throw new Problem(409, "同一幂等键不能用于不同订单");
    return { order: customerOrder(row), replayed: true };
  };
  const previous = await existing();
  if (previous) return replay(previous);
  const offer = await db
    .prepare(
      `SELECT c.*,r.service_fee_cents,r.deposit_rate_bps,oc.name||' → '||dc.name AS route_name,v.name AS vehicle_name,v.category AS vehicle_category,v.model_name AS vehicle_model,v.line_count,v.axle_count,v.effective_length_text,v.effective_volume_m3,v.dimension_limits_complete,v.max_weight_kg,v.max_length_cm,v.max_width_cm,v.max_height_cm ${offerJoin} WHERE c.id=? AND ${available}`,
    )
    .bind(data.capacity_offer_id)
    .first<Record<string, any>>();
  if (!offer || offer.remaining_capacity < data.vehicle_count)
    throw new Problem(409, "运力不足或已失效，请重新选择");
  if (
    data.cargo_weight_kg > offer.max_weight_kg ||
    data.cargo_length_cm > offer.max_length_cm ||
    data.cargo_width_cm > offer.max_width_cm ||
    data.cargo_height_cm > offer.max_height_cm
  )
    throw new Problem(400, "单车货物重量或尺寸超过车型限制");
  const id = crypto.randomUUID();
  const no = `ORD${new Date().toISOString().slice(0, 10).replaceAll("-", "")}${id.slice(0, 8).toUpperCase()}`;
  const unit = offer.carrier_price_cents + offer.service_fee_cents;
  const total = unit * data.vehicle_count;
  const deposit = Math.floor((total * offer.deposit_rate_bps + 5000) / 10000);
  const order = {
    id,
    order_no: no,
    customer_company_id: user.customer_company_id,
    customer_user_id: user.id,
    carrier_id: offer.carrier_id,
    route_id: offer.route_id,
    vehicle_type_id: offer.vehicle_type_id,
    carrier_unit_price_snapshot: offer.carrier_price_cents,
    service_fee_snapshot: offer.service_fee_cents,
    customer_unit_price_snapshot: unit,
    deposit_rate_snapshot: offer.deposit_rate_bps,
    total_amount_cents: total,
    deposit_amount_cents: deposit,
    balance_amount_cents: total - deposit,
    route_snapshot: offer.route_name,
    vehicle_type_snapshot: offer.vehicle_name,
    ...data,
    planned_loading_date: offer.loading_date,
    status: initialOrderState(),
    idempotency_key: key,
    request_hash: requestHash,
  };
  const statements = [
    db
      .prepare(
        `INSERT INTO orders(${Object.keys(order).join(",")}) VALUES(${Object.keys(
          order,
        )
          .map(() => "?")
          .join(",")})`,
      )
      .bind(...Object.values(order)),
  ];
  for (let i = 1; i <= data.vehicle_count; i++)
    statements.push(
      db
        .prepare(
          "INSERT INTO order_tasks(id,task_no,order_id,sequence,planned_loading_date) VALUES(?,?,?,?,?)",
        )
        .bind(
          crypto.randomUUID(),
          `${no}-${String(i).padStart(2, "0")}`,
          id,
          i,
          offer.loading_date,
        ),
    );
  statements.push(
    audit(
      db,
      user,
      "Order",
      id,
      "CREATE",
      null,
      {
        order_no: no,
        vehicle_count: data.vehicle_count,
        status: order.status,
        total_amount_cents: total,
      },
      ip,
    ),
  );
  try {
    await db.batch(statements);
  } catch (error) {
    const winner = await existing();
    if (winner) return replay(winner);
    if (String(error).includes("CAPACITY_UNAVAILABLE_OR_CHANGED"))
      throw new Problem(409, "运力或价格已变化，请刷新后重试");
    throw error;
  }
  return {
    order: customerOrder(
      (await db.prepare("SELECT * FROM orders WHERE id=?").bind(id).first())!,
    ),
    replayed: false,
  };
}
