import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { Miniflare } from "miniflare";
import app from "../src/api/app";
import { seedStatements, demoPassword } from "../scripts/seed-data";
let mf: Miniflare;
let db: any;
let serial = 0;
const cookies: Record<string, string> = {};
async function request(
  path: string,
  method = "GET",
  data?: unknown,
  role = "customer",
  headers: Record<string, string> = {},
) {
  const response = await app.fetch(
    new Request("https://test.local/api" + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "TruckLink",
        Origin: "https://test.local",
        "cf-connecting-ip": `test-${serial++}`,
        Cookie: cookies[role] ?? "",
        ...headers,
      },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    }),
    { DB: db, ASSETS: { fetch: () => new Response("assets") } as any },
  );
  const body = (await response.json()) as any;
  return { response, body, status: response.status };
}
before(async () => {
  mf = new Miniflare({
    modules: true,
    script: 'export default {fetch(){return new Response("ok")}}',
    compatibilityDate: "2026-08-06",
    d1Databases: ["DB"],
  });
  db = await mf.getD1Database("DB");
  for (const file of readdirSync("migrations").sort())
    for (const sql of readFileSync("migrations/" + file, "utf8")
      .split("-- statement")
      .map((x) => x.trim())
      .filter(Boolean))
      await db.prepare(sql).run();
  const seed = await seedStatements();
  await db.batch(seed.map(({ sql, args }) => db.prepare(sql).bind(...args)));
  for (const role of [
    "customer",
    "customer-b",
    "carrier",
    "admin",
    "reviewer",
    "operations",
    "finance",
  ]) {
    const result = await request(
      "/auth/login",
      "POST",
      { email: `${role}@example.test`, password: demoPassword },
      role,
    );
    assert.equal(result.status, 200, JSON.stringify(result.body));
    cookies[role] = result.response.headers.get("set-cookie")!.split(";")[0];
  }
});
after(async () => {
  await mf?.dispose();
});
const cargo = {
  vehicle_count: 2,
  cargo_name: "机械配件",
  cargo_weight_kg: 12000,
  cargo_quantity: 20,
  cargo_length_cm: 1000,
  cargo_width_cm: 200,
  cargo_height_cm: 220,
  cargo_remark: "",
  loading_address: "霍尔果斯物流园",
  loading_contact: "张先生",
  loading_phone: "13800000001",
  unloading_address: "阿拉木图仓库",
  unloading_contact: "李先生",
  unloading_phone: "+77010000001",
};
async function offer(count = 5) {
  const result = await request(
    "/carrier/capacity",
    "POST",
    {
      route_id: "horgos-almaty",
      vehicle_type_id: "box-136",
      loading_date: new Date(Date.now() + 7 * 86400000)
        .toISOString()
        .slice(0, 10),
      carrier_price_cents: 1800000,
      total_capacity: count,
      transit_days_min: 3,
      transit_days_max: 5,
      valid_until: new Date(Date.now() + 6 * 86400000).toISOString(),
    },
    "carrier",
  );
  assert.equal(result.status, 201, JSON.stringify(result.body));
  const review = await request(
    `/admin/capacity/${result.body.id}/review`,
    "POST",
    { decision: "APPROVE" },
    "reviewer",
  );
  assert.equal(review.status, 200, JSON.stringify(review.body));
  return result.body.id;
}
test("M1 integration suite", async (t) => {
  await t.test(
    "review → search → 2 trucks = 37,600 / 11,280 / 26,320; 2 tasks and remaining 3",
    async () => {
      const hidden = await request("/capacity");
      assert.equal(hidden.body.items.length, 0);
      const review = await request(
        "/admin/capacity/demo-offer/review",
        "POST",
        { decision: "APPROVE" },
        "reviewer",
      );
      assert.equal(review.status, 200);
      const search = await request("/capacity?route_id=horgos-almaty");
      assert.equal(search.body.items[0].customer_unit_price_cents, 1880000);
      const serialized = JSON.stringify(search.body);
      for (const key of [
        "Carrier A",
        "carrier_id",
        "carrier_price",
        "service_fee",
      ])
        assert.ok(!serialized.includes(key));
      const result = await request(
        "/orders",
        "POST",
        { ...cargo, capacity_offer_id: "demo-offer" },
        "customer",
        { "Idempotency-Key": "canonical-order" },
      );
      assert.equal(result.status, 201, JSON.stringify(result.body));
      const o = result.body.order;
      assert.equal(o.total_amount_cents, 3760000);
      assert.equal(o.deposit_amount_cents, 1128000);
      assert.equal(o.balance_amount_cents, 2632000);
      assert.equal(o.status, "PAYMENT_PENDING");
      assert.ok(!("carrier_id" in o));
      const detail = await request("/orders/" + o.id);
      assert.equal(detail.body.tasks.length, 2);
      assert.equal(
        (
          await db
            .prepare(
              "SELECT remaining_capacity FROM capacity_offers WHERE id='demo-offer'",
            )
            .first()
        ).remaining_capacity,
        3,
      );
      assert.equal(
        (await request("/orders/" + o.id, "GET", undefined, "customer-b"))
          .status,
        404,
      );
      assert.equal(
        (await request("/admin/orders/" + o.id, "GET", undefined, "admin")).body
          .order.carrier_unit_price_snapshot,
        1800000,
      );
      assert.equal(
        (
          await request(
            "/orders",
            "POST",
            { ...cargo, capacity_offer_id: "demo-offer" },
            "customer",
            { "Idempotency-Key": "canonical-order" },
          )
        ).status,
        200,
      );
      assert.equal(
        (
          await request(
            "/orders",
            "POST",
            { ...cargo, vehicle_count: 1, capacity_offer_id: "demo-offer" },
            "customer",
            { "Idempotency-Key": "canonical-order" },
          )
        ).status,
        409,
      );
    },
  );
  await t.test(
    "two simultaneous buyers cannot oversell last truck",
    async () => {
      const id = await offer(1);
      const outcomes = await Promise.all(
        ["customer", "customer-b"].map((role) =>
          request(
            "/orders",
            "POST",
            { ...cargo, vehicle_count: 1, capacity_offer_id: id },
            role,
            { "Idempotency-Key": "race-" + role },
          ),
        ),
      );
      assert.deepEqual(outcomes.map((x) => x.status).sort(), [201, 409]);
      const row = await db
        .prepare("SELECT * FROM capacity_offers WHERE id=?")
        .bind(id)
        .first();
      assert.equal(row.remaining_capacity, 0);
      assert.equal(row.status, "SOLD_OUT");
      assert.equal(
        (
          await db
            .prepare(
              "SELECT count(*) AS n FROM orders WHERE capacity_offer_id=?",
            )
            .bind(id)
            .first()
        ).n,
        1,
      );
    },
  );
  await t.test(
    "concurrent duplicate submissions create exactly one order and task",
    async () => {
      const id = await offer(5);
      const outcomes = await Promise.all(
        [1, 2, 3].map(() =>
          request(
            "/orders",
            "POST",
            { ...cargo, vehicle_count: 1, capacity_offer_id: id },
            "customer",
            { "Idempotency-Key": "same-request-key" },
          ),
        ),
      );
      assert.deepEqual(outcomes.map((x) => x.status).sort(), [200, 200, 201]);
      assert.equal(
        (
          await db
            .prepare(
              "SELECT remaining_capacity FROM capacity_offers WHERE id=?",
            )
            .bind(id)
            .first()
        ).remaining_capacity,
        4,
      );
    },
  );
  await t.test(
    "failure in task insert rolls back inventory and order",
    async () => {
      const id = await offer(3);
      await db
        .prepare(
          "CREATE TRIGGER test_fail_task BEFORE INSERT ON order_tasks BEGIN SELECT RAISE(ABORT,'SIMULATED_TASK_FAILURE'); END;",
        )
        .run();
      const result = await request(
        "/orders",
        "POST",
        { ...cargo, capacity_offer_id: id },
        "customer",
        { "Idempotency-Key": "rollback-test" },
      );
      assert.equal(result.status, 500);
      await db.prepare("DROP TRIGGER test_fail_task").run();
      assert.equal(
        (
          await db
            .prepare(
              "SELECT remaining_capacity FROM capacity_offers WHERE id=?",
            )
            .bind(id)
            .first()
        ).remaining_capacity,
        3,
      );
      assert.equal(
        (
          await db
            .prepare(
              "SELECT count(*) AS n FROM orders WHERE capacity_offer_id=?",
            )
            .bind(id)
            .first()
        ).n,
        0,
      );
    },
  );
  await t.test(
    "overweight, invalid dimensions and unavailable offers are rejected",
    async () => {
      const id = await offer();
      for (const patch of [
        { cargo_weight_kg: 22001 },
        { cargo_length_cm: 1361 },
        { vehicle_count: 0 },
      ])
        assert.equal(
          (
            await request(
              "/orders",
              "POST",
              { ...cargo, capacity_offer_id: id, ...patch },
              "customer",
              { "Idempotency-Key": crypto.randomUUID() },
            )
          ).status,
          400,
        );
      await db
        .prepare(
          "UPDATE capacity_offers SET valid_until='2000-01-01T00:00:00.000Z' WHERE id=?",
        )
        .bind(id)
        .run();
      assert.equal(
        (
          await request(
            "/orders",
            "POST",
            { ...cargo, capacity_offer_id: id },
            "customer",
            { "Idempotency-Key": crypto.randomUUID() },
          )
        ).status,
        409,
      );
    },
  );
  await t.test("snapshots immutable when route fees change", async () => {
    const row = await db
      .prepare("SELECT * FROM orders WHERE idempotency_key='canonical-order'")
      .first();
    await db
      .prepare(
        "UPDATE routes SET service_fee_cents=90000 WHERE id='horgos-almaty'",
      )
      .run();
    const detail = await request("/orders/" + row.id);
    assert.equal(detail.body.order.total_amount_cents, 3760000);
    await assert.rejects(
      () =>
        db
          .prepare("UPDATE orders SET total_amount_cents=1 WHERE id=?")
          .bind(row.id)
          .run(),
      /IMMUTABLE/,
    );
    await db
      .prepare(
        "UPDATE routes SET service_fee_cents=80000 WHERE id='horgos-almaty'",
      )
      .run();
  });
  await t.test(
    "RBAC, CSRF, authentication and public registration restrictions",
    async () => {
      assert.equal(
        (await request("/admin/orders", "GET", undefined, "carrier")).status,
        403,
      );
      assert.equal(
        (await request("/admin/orders", "GET", undefined, "reviewer")).status,
        403,
      );
      assert.equal(
        (
          await request(
            "/admin/capacity/demo-offer/review",
            "POST",
            { decision: "APPROVE" },
            "operations",
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await request(
            "/admin/capacity/demo-offer/review",
            "POST",
            { decision: "APPROVE" },
            "finance",
          )
        ).status,
        403,
      );
      assert.equal(
        (await request("/orders", "GET", undefined, "unknown")).status,
        401,
      );
      assert.equal(
        (
          await request("/orders", "POST", {}, "customer", {
            Origin: "https://evil.example",
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await request("/auth/register", "POST", {
            email: "evil@example.test",
            password: demoPassword,
            display_name: "evil",
            role: "SUPER_ADMIN",
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await request("/auth/login", "POST", {
            email: "customer@example.test",
            password: "incorrect-long-password",
          })
        ).status,
        401,
      );
    },
  );
  await t.test(
    "customer and carrier onboarding, approval audit, logout revocation",
    async () => {
      for (const role of ["CUSTOMER", "CARRIER"]) {
        const email = `new-${role}@example.test`;
        assert.equal(
          (
            await request("/auth/register", "POST", {
              email,
              password: demoPassword,
              display_name: "新用户",
              role,
            })
          ).status,
          201,
        );
        const login = await request("/auth/login", "POST", {
          email,
          password: demoPassword,
        });
        cookies.new = login.response.headers.get("set-cookie")!.split(";")[0];
        if (role === "CUSTOMER") {
          assert.equal(
            (
              await request(
                "/company",
                "POST",
                {
                  company_name: "新客户",
                  contact_name: "测试",
                  phone: "13800000000",
                },
                "new",
              )
            ).status,
            201,
          );
        } else {
          const created = await request(
            "/carrier/onboarding",
            "POST",
            {
              company_name: "新车队",
              contact_name: "测试",
              phone: "13800000000",
              country_id: "cn",
            },
            "new",
          );
          assert.equal(created.status, 201);
          assert.equal(
            (await request("/carrier/capacity", "POST", {}, "new")).status,
            403,
          );
          assert.equal(
            (
              await request(
                `/admin/carriers/${created.body.id}/review`,
                "POST",
                { decision: "APPROVE" },
                "reviewer",
              )
            ).status,
            200,
          );
        }
        assert.equal(
          (await request("/auth/logout", "POST", {}, "new")).status,
          200,
        );
        assert.equal(
          (await request("/auth/me", "GET", undefined, "new")).status,
          401,
        );
      }
      const logs = await request(
        "/admin/audit-logs",
        "GET",
        undefined,
        "admin",
      );
      assert.ok(logs.body.items.some((x: any) => x.action === "APPROVE"));
      assert.ok(
        logs.body.items.some(
          (x: any) => x.action === "CREATE" && x.module === "Order",
        ),
      );
    },
  );
});
