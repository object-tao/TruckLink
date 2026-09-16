import { passwordHash } from "../src/services/auth";
export const demoPassword = "TruckLink-Dev-2026!";
export async function seedStatements(password = demoPassword) {
  const digest = await passwordHash(password);
  const day = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const until = new Date(Date.now() + 6 * 86400000).toISOString();
  return [
    {
      sql: "INSERT OR IGNORE INTO customer_companies(id,company_name,contact_name,phone) VALUES('customer-a','Customer A','客户 A','13800000001')",
      args: [],
    },
    {
      sql: "INSERT OR IGNORE INTO customer_companies(id,company_name,contact_name,phone) VALUES('customer-b','Customer B','客户 B','13800000002')",
      args: [],
    },
    {
      sql: "INSERT OR IGNORE INTO carriers(id,company_name,country_id,contact_name,phone,status) VALUES('carrier-a','Carrier A','cn','车队 A','13900000001','ACTIVE')",
      args: [],
    },
    ...[
      [
        "customer-a-user",
        "customer@example.test",
        "客户 A",
        "CUSTOMER",
        "customer-a",
        null,
      ],
      [
        "customer-b-user",
        "customer-b@example.test",
        "客户 B",
        "CUSTOMER",
        "customer-b",
        null,
      ],
      [
        "carrier-a-user",
        "carrier@example.test",
        "车队 A",
        "CARRIER",
        null,
        "carrier-a",
      ],
      [
        "admin-user",
        "admin@example.test",
        "平台管理员",
        "SUPER_ADMIN",
        null,
        null,
      ],
      [
        "operations-user",
        "operations@example.test",
        "运营人员",
        "OPERATIONS",
        null,
        null,
      ],
      [
        "reviewer-user",
        "reviewer@example.test",
        "审核人员",
        "REVIEWER",
        null,
        null,
      ],
      [
        "finance-user",
        "finance@example.test",
        "财务人员",
        "FINANCE",
        null,
        null,
      ],
    ].map((row) => ({
      sql: "INSERT OR IGNORE INTO users(id,email,display_name,role,customer_company_id,carrier_id,password_hash) VALUES(?,?,?,?,?,?,?)",
      args: [...row, digest],
    })),
    {
      sql: "INSERT OR IGNORE INTO capacity_offers(id,offer_no,carrier_id,route_id,vehicle_type_id,loading_date,carrier_price_cents,total_capacity,remaining_capacity,transit_days_min,transit_days_max,valid_until,status,created_by) VALUES('demo-offer','CAP-DEMO-A','carrier-a','horgos-almaty','box-136',?,1800000,5,5,3,5,?,'PENDING_REVIEW','carrier-a-user')",
      args: [day, until],
    },
  ];
}

export function m2SeedStatements() {
  const day = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const until = new Date(Date.now() + 6 * 86400000).toISOString();
  return [
    {
      sql: "INSERT OR IGNORE INTO vehicles(id,carrier_id,plate_number,country_id,vehicle_type_id,status,created_by,reviewed_by,reviewed_at) VALUES('demo-vehicle','carrier-a','新A·TL001','cn','box-136','ACTIVE','carrier-a-user','reviewer-user',strftime('%Y-%m-%dT%H:%M:%fZ','now'))",
      args: [],
    },
    {
      sql: "INSERT OR IGNORE INTO drivers(id,carrier_id,name,phone,id_number,status,created_by) VALUES('demo-driver','carrier-a','张师傅','13900000999','DEMO-DRIVER-0001','ACTIVE','carrier-a-user')",
      args: [],
    },
    {
      sql: "INSERT OR IGNORE INTO capacity_offers(id,offer_no,carrier_id,route_id,vehicle_type_id,loading_date,carrier_price_cents,total_capacity,remaining_capacity,transit_days_min,transit_days_max,valid_until,status,created_by,approved_by,approved_at) VALUES('m2-demo-offer','CAP-M2-DEMO','carrier-a','horgos-almaty','box-136',?,1800000,2,2,3,5,?,'AVAILABLE','carrier-a-user','reviewer-user',strftime('%Y-%m-%dT%H:%M:%fZ','now'))",
      args: [day, until],
    },
    {
      sql: "INSERT INTO orders(id,order_no,customer_company_id,customer_user_id,capacity_offer_id,carrier_id,route_id,vehicle_type_id,vehicle_count,carrier_unit_price_snapshot,service_fee_snapshot,customer_unit_price_snapshot,deposit_rate_snapshot,total_amount_cents,deposit_amount_cents,balance_amount_cents,route_snapshot,vehicle_type_snapshot,cargo_name,cargo_weight_kg,cargo_quantity,cargo_length_cm,cargo_width_cm,cargo_height_cm,cargo_remark,loading_address,loading_contact,loading_phone,unloading_address,unloading_contact,unloading_phone,planned_loading_date,status,idempotency_key,request_hash) SELECT 'm2-demo-order','TL-M2-DEMO','customer-a','customer-a-user','m2-demo-offer','carrier-a','horgos-almaty','box-136',1,1800000,80000,1880000,3000,1880000,564000,1316000,'霍尔果斯 → 阿拉木图','13.6m Box Truck','机械配件',12000,20,1000,200,220,'Milestone 2 本地演示订单','霍尔果斯物流园','客户 A','13800000001','阿拉木图仓库','收货人','77010000001',?,'CARRIER_CONFIRM_PENDING','m2-local-demo','m2-local-demo-hash' WHERE NOT EXISTS(SELECT 1 FROM orders WHERE id='m2-demo-order')",
      args: [day],
    },
    {
      sql: "INSERT INTO order_tasks(id,task_no,order_id,sequence,status,planned_loading_date) SELECT 'm2-demo-task','TASK-M2-DEMO','m2-demo-order',1,'CARRIER_CONFIRM_PENDING',? WHERE EXISTS(SELECT 1 FROM orders WHERE id='m2-demo-order') AND NOT EXISTS(SELECT 1 FROM order_tasks WHERE id='m2-demo-task')",
      args: [day],
    },
  ];
}
