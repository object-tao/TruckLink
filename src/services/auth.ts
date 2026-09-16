import { Problem } from "../api/types";
const encoder = new TextEncoder();
const hex = (bytes: ArrayBuffer) =>
  [...new Uint8Array(bytes)]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
export async function hash(value: string) {
  return hex(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}
export async function passwordHash(
  password: string,
  salt: string = crypto.randomUUID(),
) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const digest = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      iterations: 100000,
      salt: encoder.encode(salt),
    },
    key,
    256,
  );
  return `pbkdf2$100000$${salt}$${hex(digest)}`;
}
export async function passwordMatches(password: string, stored: string) {
  const salt = stored.split("$")[2];
  if (!salt) return false;
  const candidate = await passwordHash(password, salt);
  let difference = candidate.length ^ stored.length;
  for (let i = 0; i < candidate.length; i++)
    difference |= candidate.charCodeAt(i) ^ (stored.charCodeAt(i) || 0);
  return difference === 0;
}
export async function throttle(db: D1Database, key: string, limit = 20) {
  const now = Date.now();
  const row = await db
    .prepare(
      `INSERT INTO auth_limits(key,attempts,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN expires_at<? THEN 1 ELSE attempts+1 END, expires_at=CASE WHEN expires_at<? THEN excluded.expires_at ELSE expires_at END RETURNING attempts`,
    )
    .bind(key, now + 15 * 60 * 1000, now, now)
    .first<{ attempts: number }>();
  if (row!.attempts > limit)
    throw new Problem(429, "操作过于频繁，请 15 分钟后再试");
}
