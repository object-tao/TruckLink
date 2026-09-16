import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { Miniflare } from "miniflare";

let mf: Miniflare;
let db: D1Database;

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
});

after(async () => mf?.dispose());

test("vehicle catalog imports all 27 supplied variants without losing source fields", async () => {
  const counts = await db
    .prepare(
      "SELECT category,COUNT(*) AS count FROM vehicle_types WHERE category IS NOT NULL GROUP BY category ORDER BY category",
    )
    .all<{ category: string; count: number }>();
  assert.deepEqual(counts.results, [
    { category: "冷藏车", count: 1 },
    { category: "普通平板车", count: 7 },
    { category: "蓬布车", count: 12 },
    { category: "超限车", count: 7 },
  ]);

  const blade = await db
    .prepare(
      "SELECT catalog_sequence,model_name,line_count,axle_count,effective_length_text,effective_volume_m3,max_weight_kg,max_length_cm FROM vehicle_types WHERE id='oversize-blade'",
    )
    .first();
  assert.deepEqual(blade, {
    catalog_sequence: 25,
    model_name: "叶片板",
    line_count: 1,
    axle_count: 1,
    effective_length_text: "13.6-70",
    effective_volume_m3: 200,
    max_weight_kg: 100000,
    max_length_cm: 7000,
  });

  const spliced = await db
    .prepare(
      "SELECT effective_length_text,dimension_limits_complete FROM vehicle_types WHERE id='oversize-spliced'",
    )
    .first();
  assert.deepEqual(spliced, {
    effective_length_text: "无标准",
    dimension_limits_complete: 0,
  });
});
