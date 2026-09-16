import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { Miniflare } from "miniflare";
import app from "../src/api/app";
import { demoPassword, seedStatements } from "../scripts/seed-data";

let mf: Miniflare;
let db: D1Database;
const cookies: Record<string, string> = {};
let serial = 0;

async function request(
  path: string,
  method = "GET",
  role = "admin",
  data?: unknown,
) {
  const response = await app.fetch(
    new Request("https://test.local/api" + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "TruckLink",
        Origin: "https://test.local",
        "cf-connecting-ip": `vehicle-delete-${serial++}`,
        Cookie: cookies[role] ?? "",
      },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    }),
    { DB: db, ASSETS: { fetch: () => new Response("assets") } as any },
  );
  const text = await response.text();
  return {
    status: response.status,
    body: text ? (JSON.parse(text) as any) : null,
  };
}

async function login(role: "admin" | "reviewer") {
  const response = await app.fetch(
    new Request("https://test.local/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "TruckLink",
        Origin: "https://test.local",
      },
      body: JSON.stringify({
        email: `${role}@example.test`,
        password: demoPassword,
      }),
    }),
    { DB: db, ASSETS: { fetch: () => new Response("assets") } as any },
  );
  assert.equal(response.status, 200);
  cookies[role] = response.headers.get("set-cookie")!.split(";")[0];
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
    for (const sql of readFileSync(`migrations/${file}`, "utf8")
      .split("-- statement")
      .map((x) => x.trim())
      .filter(Boolean))
      await db.prepare(sql).run();
  const seed = await seedStatements();
  await db.batch(seed.map(({ sql, args }) => db.prepare(sql).bind(...args)));
});

after(async () => {
  await mf?.dispose();
});

test("vehicle type deletion removes unreferenced records and protects references", async () => {
  await login("admin");
  await login("reviewer");

  const deleted = await request(
    "/admin/vehicle-types/oversize-spliced",
    "DELETE",
  );
  assert.equal(deleted.status, 200, JSON.stringify(deleted.body));
  assert.equal(deleted.body.status, "DELETED");
  const missing = await db
    .prepare("SELECT id FROM vehicle_types WHERE id='oversize-spliced'")
    .first();
  assert.equal(missing, null);

  const referenced = await request("/admin/vehicle-types/box-136", "DELETE");
  assert.equal(referenced.status, 409);
  assert.match(referenced.body.error, /引用/);

  const forbidden = await request(
    "/admin/vehicle-types/oversize-blade",
    "DELETE",
    "reviewer",
  );
  assert.equal(forbidden.status, 403);

  const logs = await request("/admin/audit-logs");
  assert.equal(logs.status, 200);
  assert.ok(
    logs.body.items.some(
      (row: Record<string, unknown>) =>
        row.object_id === "oversize-spliced" && row.action === "DELETE",
    ),
  );
});
