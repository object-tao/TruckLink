import { passwordHash } from "../src/services/auth";
const {
  CLOUDFLARE_API_TOKEN,
  CLOUDFLARE_ACCOUNT_ID,
  TRUCKLINK_ADMIN_EMAIL,
  TRUCKLINK_ADMIN_PASSWORD,
} = process.env;
if (
  !CLOUDFLARE_API_TOKEN ||
  !CLOUDFLARE_ACCOUNT_ID ||
  !TRUCKLINK_ADMIN_EMAIL ||
  !TRUCKLINK_ADMIN_PASSWORD ||
  TRUCKLINK_ADMIN_PASSWORD.length < 16
)
  throw new Error(
    "Cloudflare credentials and admin email/password (16+ characters) required in environment",
  );
const response = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/d1/database/190bfc72-b6f9-406e-b1a9-8c5035df40b7/query`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sql: "INSERT INTO users(id,email,display_name,role,password_hash) SELECT ?,?,'平台管理员','SUPER_ADMIN',? WHERE NOT EXISTS(SELECT 1 FROM users WHERE role='SUPER_ADMIN')",
      params: [
        crypto.randomUUID(),
        TRUCKLINK_ADMIN_EMAIL.toLowerCase(),
        await passwordHash(TRUCKLINK_ADMIN_PASSWORD),
      ],
    }),
  },
);
const data = (await response.json()) as any;
if (!response.ok || !data.success)
  throw new Error("Bootstrap failed: " + JSON.stringify(data.errors));
console.log("Admin bootstrap complete; existing admins are not overwritten.");
