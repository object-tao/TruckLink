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
