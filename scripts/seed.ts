import { writeFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { seedStatements, demoPassword } from "./seed-data";
if (process.argv.includes("--remote"))
  throw new Error(
    "Demo seed is local-only. Use bootstrap-admin.ts for production.",
  );
const literal = (value: unknown) =>
  value === null
    ? "NULL"
    : typeof value === "number"
      ? String(value)
      : `'${String(value).replaceAll("'", "''")}'`;
const queries = await seedStatements();
const sql = queries
  .map(({ sql, args }) => {
    let index = 0;
    return sql.replaceAll("?", () => literal(args[index++])) + ";";
  })
  .join("\n");
mkdirSync(".wrangler", { recursive: true });
writeFileSync(".wrangler/local-seed.sql", sql);
const result = spawnSync(
  process.execPath,
  [
    "node_modules/wrangler/bin/wrangler.js",
    "d1",
    "execute",
    "trucklink-db",
    "--local",
    "--file=.wrangler/local-seed.sql",
  ],
  { stdio: "inherit" },
);
if (result.status) process.exit(result.status);
console.log(
  `Local demo accounts: admin / customer / carrier / reviewer / operations / finance @example.test. Password: ${demoPassword}`,
);
