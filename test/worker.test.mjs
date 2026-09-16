import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.mjs";

test("health identifies the deployed revision and disables caching", async () => {
  const response = await worker.fetch(new Request("https://example.com/health"), { DEPLOY_COMMIT: "test-revision" });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { status: "ok", service: "trucklink", commit: "test-revision" });
});

test("placeholder, unknown paths, HEAD and unsupported methods", async () => {
  const request = (path, method = "GET") => worker.fetch(new Request(`https://example.com${path}`, { method }), {});
  assert.match(await (await request("/")).text(), /TruckLink/);
  assert.equal((await request("/missing")).status, 404);
  assert.equal(await (await request("/health", "HEAD")).text(), "");
  const response = await request("/health", "POST");
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "GET, HEAD");
});
