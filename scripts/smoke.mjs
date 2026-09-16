import assert from "node:assert/strict";
import { setTimeout } from "node:timers/promises";

const base = process.env.DEPLOY_URL;
const commit = process.env.EXPECTED_COMMIT;
assert.ok(base, "DEPLOY_URL is required");
assert.ok(commit, "EXPECTED_COMMIT is required");
for (let attempt = 1; attempt <= 12; attempt++) {
  try {
    const response = await fetch(new URL("/health", base), {
      signal: AbortSignal.timeout(10000),
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.status, "ok");
    assert.equal(body.service, "trucklink");
    assert.equal(body.commit, commit, "Deployed revision does not match");
    assert.equal(body.milestone, 2);
    const page = await fetch(new URL("/login", base), {
      signal: AbortSignal.timeout(10000),
    });
    assert.equal(page.status, 200);
    assert.match(await page.text(), /id="root"/);
    const privateApi = await fetch(new URL("/api/orders", base), {
      signal: AbortSignal.timeout(10000),
    });
    assert.equal(privateApi.status, 401, "Orders must require authentication");
    console.log(`Deployment verified: ${base} (${commit})`);
    break;
  } catch (error) {
    if (attempt === 12) throw error;
    console.log(`Health check attempt ${attempt} failed; retrying in 10s`);
    await setTimeout(10000);
  }
}
