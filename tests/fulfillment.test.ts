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
        "cf-connecting-ip": `m2-${serial++}`,
        Cookie: cookies[role] ?? "",
        ...headers,
      },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    }),
    { DB: db, ASSETS: { fetch: () => new Response("assets") } as any },
  );
  return {
    response,
    body: (await response.json()) as any,
    status: response.status,
  };
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
    const login = await request(
      "/auth/login",
      "POST",
      { email: `${role}@example.test`, password: demoPassword },
      role,
    );
    assert.equal(login.status, 200);
    cookies[role] = login.response.headers.get("set-cookie")!.split(";")[0];
  }
});
after(async () => mf?.dispose());
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
  loading_contact: "客户 A",
  loading_phone: "13800000001",
  unloading_address: "阿拉木图仓库",
  unloading_contact: "收货人",
  unloading_phone: "77010000001",
};
test("M2 carrier fulfillment integration", async (t) => {
  let orderId: string;
  let taskIds: string[] = [];
  let vehicleId: string;
  let secondVehicleId: string;
  let driverId: string;
  await t.test(
    "prepare a paid-stage order without implementing M3 payment",
    async () => {
      assert.equal(
        (
          await request(
            "/admin/capacity/demo-offer/review",
            "POST",
            { decision: "APPROVE" },
            "reviewer",
          )
        ).status,
        200,
      );
      const created = await request(
        "/orders",
        "POST",
        { ...cargo, capacity_offer_id: "demo-offer" },
        "customer",
        { "Idempotency-Key": "m2-order-fixture" },
      );
      assert.equal(created.status, 201);
      orderId = created.body.order.id;
      await db
        .prepare(
          "UPDATE orders SET status='CARRIER_CONFIRM_PENDING' WHERE id=?",
        )
        .bind(orderId)
        .run();
      taskIds = (
        await db
          .prepare(
            "SELECT id FROM order_tasks WHERE order_id=? ORDER BY sequence",
          )
          .bind(orderId)
          .all()
      ).results.map((x: any) => x.id);
    },
  );
  await t.test(
    "vehicle and driver registration enforce review and tenant boundaries",
    async () => {
      const vehicle = await request(
        "/carrier/vehicles",
        "POST",
        {
          plate_number: "新A12345",
          country_id: "cn",
          vehicle_type_id: "box-136",
        },
        "carrier",
      );
      assert.equal(vehicle.status, 201);
      vehicleId = vehicle.body.id;
      const second = await request(
        "/carrier/vehicles",
        "POST",
        {
          plate_number: "新A54321",
          country_id: "cn",
          vehicle_type_id: "box-136",
        },
        "carrier",
      );
      secondVehicleId = second.body.id;
      const wrongType = await request(
        "/carrier/vehicles",
        "POST",
        {
          plate_number: "新B99999",
          country_id: "cn",
          vehicle_type_id: "flatbed",
        },
        "carrier",
      );
      assert.equal(wrongType.status, 201);
      const driver = await request(
        "/carrier/drivers",
        "POST",
        { name: "王师傅", phone: "13900000088", id_number: "CN-DRIVER-000088" },
        "carrier",
      );
      assert.equal(driver.status, 201);
      driverId = driver.body.id;
      const listed = await request(
        "/carrier/drivers",
        "GET",
        undefined,
        "carrier",
      );
      assert.ok(listed.body.items[0].id_number_masked.endsWith("0088"));
      assert.equal(listed.body.items[0].id_number, undefined);
      assert.equal(
        (
          await request(
            `/admin/vehicles/${vehicleId}/review`,
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
            `/admin/vehicles/${vehicleId}/review`,
            "POST",
            { decision: "APPROVE" },
            "reviewer",
          )
        ).status,
        200,
      );
      assert.equal(
        (
          await request(
            `/admin/vehicles/${secondVehicleId}/review`,
            "POST",
            { decision: "APPROVE" },
            "reviewer",
          )
        ).status,
        200,
      );
    },
  );
  await t.test(
    "carrier confirmation and two task assignments reach READY only after all reviews",
    async () => {
      const confirmed = await request(
        `/carrier/orders/${orderId}/confirm`,
        "POST",
        {},
        "carrier",
      );
      assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));
      assert.equal(confirmed.body.status, "VEHICLE_ASSIGN_PENDING");
      assert.equal(
        (
          await request(
            `/carrier/orders/${orderId}/confirm`,
            "POST",
            {},
            "carrier",
          )
        ).status,
        409,
      );
      for (const id of taskIds) {
        const assigned = await request(
          `/carrier/tasks/${id}/assignment`,
          "POST",
          { vehicle_id: vehicleId, driver_id: driverId },
          "carrier",
        );
        assert.equal(assigned.status, 200);
      }
      let order = await db
        .prepare("SELECT status FROM orders WHERE id=?")
        .bind(orderId)
        .first();
      assert.equal(order.status, "VEHICLE_REVIEW_PENDING");
      assert.equal(
        (
          await request(
            `/admin/tasks/${taskIds[0]}/assignment-review`,
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
            `/admin/tasks/${taskIds[0]}/assignment-review`,
            "POST",
            { decision: "APPROVE" },
            "reviewer",
          )
        ).status,
        200,
      );
      order = await db
        .prepare("SELECT status FROM orders WHERE id=?")
        .bind(orderId)
        .first();
      assert.equal(order.status, "VEHICLE_REVIEW_PENDING");
      assert.equal(
        (
          await request(
            `/admin/tasks/${taskIds[1]}/assignment-review`,
            "POST",
            { decision: "APPROVE" },
            "reviewer",
          )
        ).status,
        200,
      );
      order = await db
        .prepare("SELECT status FROM orders WHERE id=?")
        .bind(orderId)
        .first();
      assert.equal(order.status, "READY_FOR_LOADING");
    },
  );
  await t.test(
    "vehicle replacement always returns task and order to review",
    async () => {
      assert.equal(
        (
          await request(
            `/carrier/tasks/${taskIds[0]}/assignment`,
            "POST",
            { vehicle_id: secondVehicleId, driver_id: driverId },
            "carrier",
          )
        ).status,
        200,
      );
      assert.equal(
        (
          await db
            .prepare(
              "SELECT status,assignment_version FROM order_tasks WHERE id=?",
            )
            .bind(taskIds[0])
            .first()
        ).assignment_version,
        2,
      );
      assert.equal(
        (
          await db
            .prepare("SELECT status FROM orders WHERE id=?")
            .bind(orderId)
            .first()
        ).status,
        "VEHICLE_REVIEW_PENDING",
      );
      assert.equal(
        (
          await request(
            `/admin/tasks/${taskIds[0]}/assignment-review`,
            "POST",
            { decision: "APPROVE" },
            "reviewer",
          )
        ).status,
        200,
      );
      assert.equal(
        (
          await db
            .prepare("SELECT status FROM orders WHERE id=?")
            .bind(orderId)
            .first()
        ).status,
        "READY_FOR_LOADING",
      );
    },
  );
  await t.test(
    "events enforce sequence, idempotency and aggregate order state",
    async () => {
      const times = new Map<string, string>();
      const event = (task: string, type: string, key: string) =>
        request(
          `/carrier/tasks/${task}/events`,
          "POST",
          {
            event_type: type,
            event_time:
              times.get(key) ??
              times.set(key, new Date().toISOString()).get(key),
            country_id: "cn",
            city_id: "horgos",
            location_text: "霍尔果斯口岸",
            remark: "",
          },
          "carrier",
          { "Idempotency-Key": key },
        );
      assert.equal(
        (await event(taskIds[0], "IN_TRANSIT", "event-too-early")).status,
        409,
      );
      for (let i = 0; i < 2; i++)
        assert.equal(
          (await event(taskIds[i], "LOADED", `loaded-task-${i}`)).status,
          201,
        );
      assert.equal(
        (
          await db
            .prepare("SELECT status FROM orders WHERE id=?")
            .bind(orderId)
            .first()
        ).status,
        "LOADED",
      );
      const first = await event(taskIds[0], "CHINA_EXITED", "depart-task-0");
      assert.equal(first.status, 201);
      assert.equal(
        (await event(taskIds[0], "CHINA_EXITED", "depart-task-0")).status,
        200,
      );
      assert.equal(
        (
          await db
            .prepare("SELECT status FROM orders WHERE id=?")
            .bind(orderId)
            .first()
        ).status,
        "LOADED",
      );
      assert.equal(
        (await event(taskIds[1], "IN_TRANSIT", "depart-task-1")).status,
        201,
      );
      assert.equal(
        (
          await db
            .prepare("SELECT status FROM orders WHERE id=?")
            .bind(orderId)
            .first()
        ).status,
        "IN_TRANSIT",
      );
    },
  );
  await t.test(
    "customer tracking is readable but hides vehicle, driver and operator identity",
    async () => {
      const result = await request(`/orders/${orderId}/tracking`);
      assert.equal(result.status, 200);
      assert.equal(result.body.tasks.length, 2);
      assert.equal(result.body.events.length, 4);
      const serialized = JSON.stringify(result.body);
      for (const secret of [
        "vehicle_id",
        "driver_id",
        "operator_id",
        "plate_number",
        "driver_phone",
      ])
        assert.ok(!serialized.includes(secret));
      assert.equal(
        (
          await request(
            `/orders/${orderId}/tracking`,
            "GET",
            undefined,
            "customer-b",
          )
        ).status,
        404,
      );
    },
  );
  await t.test(
    "audit records carrier confirmation, reassignment, review and events",
    async () => {
      const result = await request(
        "/admin/audit-logs",
        "GET",
        undefined,
        "admin",
      );
      for (const action of [
        "CARRIER_CONFIRM",
        "ASSIGN",
        "REASSIGN",
        "ASSIGNMENT_APPROVE",
        "CREATE",
      ])
        assert.ok(
          result.body.items.some((x: any) => x.action === action),
          action,
        );
    },
  );
});
