import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { z, ZodError } from "zod";
import { Problem, type AppEnv, type User, type Role } from "./types";
import {
  hash,
  passwordHash,
  passwordMatches,
  throttle,
} from "../services/auth";
import { audit } from "../services/audit";
import {
  loginSchema,
  registerSchema,
  companySchema,
  carrierSchema,
  routeSchema,
  vehicleSchema,
} from "../services/validation";
import {
  createOffer,
  searchCapacity,
  review,
  createOrder,
  customerOrder,
  offerJoin,
} from "../services/marketplace";

const app = new Hono<AppEnv>();
const userFields = "id,email,display_name,role,customer_company_id,carrier_id";
const roles = (user: User, allowed: Role[]) => {
  if (!allowed.includes(user.role)) throw new Problem(403, "没有此操作权限");
};
const platform: Role[] = ["SUPER_ADMIN", "OPERATIONS", "REVIEWER", "FINANCE"];
const reviewers: Role[] = ["SUPER_ADMIN", "REVIEWER"];
const masters: Role[] = ["SUPER_ADMIN", "OPERATIONS"];

app.onError((error, c) => {
  if (error instanceof ZodError)
    return c.json(
      {
        error: error.issues
          .map((x) => `${x.path.join(".")}: ${x.message}`)
          .join("；"),
      },
      400,
    );
  if (error instanceof Problem)
    return c.json({ error: error.message }, error.status);
  if (error instanceof SyntaxError)
    return c.json({ error: "请求 JSON 格式错误" }, 400);
  if (/UNIQUE constraint/.test(String(error)))
    return c.json({ error: "记录已存在，请勿重复提交" }, 409);
  if (/FOREIGN KEY|CHECK constraint/.test(String(error)))
    return c.json({ error: "关联数据或字段约束不满足" }, 400);
  console.error(
    "Request failed",
    error instanceof Error ? error.message : "Unknown error",
  );
  return c.json({ error: "服务暂时不可用，请稍后重试" }, 500);
});
app.use("*", async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "same-origin");
  c.header("X-Frame-Options", "DENY");
  c.header(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  );
  if (c.req.path.startsWith("/api") || c.req.path === "/health")
    c.header("Cache-Control", "no-store");
});
app.use("/api/*", async (c, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
    const origin = c.req.header("origin");
    if (
      c.req.header("X-Requested-With") !== "TruckLink" ||
      (origin && origin !== new URL(c.req.url).origin)
    )
      throw new Problem(403, "请求来源验证失败");
    if (!(c.req.header("content-type") ?? "").startsWith("application/json"))
      throw new Problem(400, "请使用 JSON 请求");
    const body = await c.req.text();
    if (new TextEncoder().encode(body).length > 32768)
      throw new Problem(400, "请求内容过大");
  }
  await next();
});
app.get("/health", async (c) => {
  await c.env.DB.prepare("SELECT id FROM routes LIMIT 1").first();
  return c.json({
    status: "ok",
    service: "trucklink",
    milestone: 1,
    commit: c.env.DEPLOY_COMMIT ?? "local",
  });
});

app.post("/api/auth/register", async (c) => {
  await throttle(
    c.env.DB,
    `register:${await hash(c.req.header("cf-connecting-ip") ?? "local")}`,
    10,
  );
  const data = registerSchema.parse(await c.req.json());
  const id = crypto.randomUUID();
  const digest = await passwordHash(data.password);
  const user: User = {
    id,
    email: data.email,
    display_name: data.display_name,
    role: data.role,
    customer_company_id: null,
    carrier_id: null,
  };
  await c.env.DB.batch([
    c.env.DB.prepare(
      "INSERT INTO users(id,email,display_name,role,password_hash) VALUES(?,?,?,?,?)",
    ).bind(id, data.email, data.display_name, data.role, digest),
    audit(
      c.env.DB,
      user,
      "User",
      id,
      "REGISTER",
      null,
      { role: data.role },
      c.req.header("cf-connecting-ip") ?? null,
    ),
  ]);
  return c.json({ message: "账号已创建，请登录" }, 201);
});
app.post("/api/auth/login", async (c) => {
  const data = loginSchema.parse(await c.req.json());
  await throttle(
    c.env.DB,
    `login-ip:${await hash(c.req.header("cf-connecting-ip") ?? "local")}`,
    100,
  );
  await throttle(c.env.DB, `login-user:${await hash(data.email)}`, 20);
  const user = await c.env.DB.prepare(
    `SELECT ${userFields},password_hash FROM users WHERE email=? AND active=1`,
  )
    .bind(data.email)
    .first<User & { password_hash: string }>();
  const valid = await passwordMatches(
    data.password,
    user?.password_hash ??
      "pbkdf2$100000$dummy$0000000000000000000000000000000000000000000000000000000000000000",
  );
  if (!user || !valid) throw new Problem(401, "邮箱或密码错误");
  const token = crypto.randomUUID() + crypto.randomUUID();
  const tokenHash = await hash(token);
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM sessions WHERE expires_at<?").bind(
      new Date().toISOString(),
    ),
    c.env.DB.prepare(
      "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)",
    ).bind(
      tokenHash,
      user.id,
      new Date(Date.now() + 12 * 3600000).toISOString(),
    ),
    audit(
      c.env.DB,
      user,
      "User",
      user.id,
      "LOGIN",
      null,
      null,
      c.req.header("cf-connecting-ip") ?? null,
    ),
  ]);
  setCookie(c, "tl_session", token, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Lax",
    path: "/",
    maxAge: 43200,
  });
  const { password_hash, ...safe } = user;
  return c.json({ user: safe });
});
app.use("/api/*", async (c, next) => {
  const token = getCookie(c, "tl_session");
  if (!token) throw new Problem(401, "请先登录");
  const tokenHash = await hash(token);
  const user = await c.env.DB.prepare(
    `SELECT ${userFields
      .split(",")
      .map((x) => "u." + x)
      .join(
        ",",
      )} FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.active=1`,
  )
    .bind(tokenHash, new Date().toISOString())
    .first<User>();
  if (!user) throw new Problem(401, "登录已过期，请重新登录");
  c.set("user", user);
  c.set("tokenHash", tokenHash);
  await next();
});
app.get("/api/auth/me", (c) => c.json({ user: c.get("user") }));
app.post("/api/auth/logout", async (c) => {
  await c.env.DB.prepare("DELETE FROM sessions WHERE token_hash=?")
    .bind(c.get("tokenHash"))
    .run();
  deleteCookie(c, "tl_session", { path: "/" });
  return c.json({ ok: true });
});
app.post("/api/auth/password", async (c) => {
  const data = z
    .object({
      current_password: z.string().max(128),
      new_password: z.string().min(12).max(128),
    })
    .strict()
    .parse(await c.req.json());
  const user = c.get("user");
  await throttle(c.env.DB, `password:${user.id}`, 10);
  const stored = await c.env.DB.prepare(
    "SELECT password_hash FROM users WHERE id=?",
  )
    .bind(user.id)
    .first<{ password_hash: string }>();
  if (!(await passwordMatches(data.current_password, stored!.password_hash)))
    throw new Problem(400, "当前密码错误");
  await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE users SET password_hash=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?",
    ).bind(await passwordHash(data.new_password), user.id),
    c.env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(user.id),
    audit(
      c.env.DB,
      user,
      "User",
      user.id,
      "CHANGE_PASSWORD",
      null,
      null,
      c.req.header("cf-connecting-ip") ?? null,
    ),
  ]);
  deleteCookie(c, "tl_session", { path: "/" });
  return c.json({ ok: true });
});
app.get("/api/master-data", async (c) => {
  const db = c.env.DB;
  const user = c.get("user");
  const [countries, cities, vehicles, routes] = await db.batch([
    db.prepare("SELECT * FROM countries"),
    db.prepare("SELECT * FROM cities"),
    db.prepare(
      `SELECT * FROM vehicle_types ${platform.includes(user.role) ? "" : "WHERE status='ACTIVE'"}`,
    ),
    db.prepare(
      `SELECT r.*,oc.name AS origin_city,dc.name AS destination_city FROM routes r JOIN cities oc ON oc.id=r.origin_city_id JOIN cities dc ON dc.id=r.destination_city_id ${platform.includes(user.role) ? "" : "WHERE r.status='ACTIVE'"} ORDER BY r.route_code`,
    ),
  ]);
  return c.json({
    countries: countries.results,
    cities: cities.results,
    vehicle_types: vehicles.results,
    routes: (routes.results as Record<string, unknown>[]).map((row) => {
      if (platform.includes(user.role)) return row;
      const { service_fee_cents, ...safe } = row;
      return safe;
    }),
  });
});
app.get("/api/company", async (c) => {
  const u = c.get("user");
  roles(u, ["CUSTOMER"]);
  return c.json({
    company: u.customer_company_id
      ? await c.env.DB.prepare("SELECT * FROM customer_companies WHERE id=?")
          .bind(u.customer_company_id)
          .first()
      : null,
  });
});
app.post("/api/company", async (c) => {
  const u = c.get("user");
  roles(u, ["CUSTOMER"]);
  if (u.customer_company_id) throw new Problem(409, "企业已建档");
  const data = companySchema.parse(await c.req.json());
  const id = crypto.randomUUID();
  // An optimistic guard makes simultaneous onboarding roll back rather than leave orphan records.
  await c.env.DB.batch([
    c.env.DB.prepare(
      "INSERT INTO customer_companies(id,company_name,contact_name,phone) VALUES(?,?,?,?)",
    ).bind(id, data.company_name, data.contact_name, data.phone),
    c.env.DB.prepare(
      "UPDATE users SET customer_company_id=CASE WHEN customer_company_id IS NULL THEN ? ELSE 'invalid-concurrent-onboarding' END WHERE id=?",
    ).bind(id, u.id),
    audit(
      c.env.DB,
      u,
      "CustomerCompany",
      id,
      "CREATE",
      null,
      data,
      c.req.header("cf-connecting-ip") ?? null,
    ),
  ]);
  return c.json({ id }, 201);
});
app.get("/api/carrier/profile", async (c) => {
  const u = c.get("user");
  roles(u, ["CARRIER"]);
  return c.json({
    carrier: u.carrier_id
      ? await c.env.DB.prepare("SELECT * FROM carriers WHERE id=?")
          .bind(u.carrier_id)
          .first()
      : null,
  });
});
app.post("/api/carrier/onboarding", async (c) => {
  const u = c.get("user");
  roles(u, ["CARRIER"]);
  if (u.carrier_id) throw new Problem(409, "车队已提交入驻");
  const data = carrierSchema.parse(await c.req.json());
  const id = crypto.randomUUID();
  await c.env.DB.batch([
    c.env.DB.prepare(
      "INSERT INTO carriers(id,company_name,country_id,contact_name,phone) VALUES(?,?,?,?,?)",
    ).bind(
      id,
      data.company_name,
      data.country_id,
      data.contact_name,
      data.phone,
    ),
    c.env.DB.prepare(
      "UPDATE users SET carrier_id=CASE WHEN carrier_id IS NULL THEN ? ELSE 'invalid-concurrent-onboarding' END WHERE id=?",
    ).bind(id, u.id),
    audit(
      c.env.DB,
      u,
      "Carrier",
      id,
      "ONBOARD",
      null,
      data,
      c.req.header("cf-connecting-ip") ?? null,
    ),
  ]);
  return c.json({ id, status: "PENDING" }, 201);
});
app.get("/api/capacity", async (c) => {
  roles(c.get("user"), ["CUSTOMER"]);
  return c.json({
    items: await searchCapacity(c.env.DB, new URL(c.req.url).searchParams),
  });
});
app.get("/api/capacity/:id", async (c) => {
  roles(c.get("user"), ["CUSTOMER"]);
  const rows = await searchCapacity(
    c.env.DB,
    new URLSearchParams(),
    c.req.param("id"),
  );
  if (!rows.length) throw new Problem(404, "运力不可用");
  return c.json({ offer: rows[0] });
});
app.get("/api/carrier/capacity", async (c) => {
  const u = c.get("user");
  roles(u, ["CARRIER"]);
  const rows = await c.env.DB.prepare(
    `SELECT c.*,oc.name AS origin_city,dc.name AS destination_city,v.name AS vehicle_type ${offerJoin} WHERE c.carrier_id=? ORDER BY c.created_at DESC LIMIT 100`,
  )
    .bind(u.carrier_id ?? "")
    .all();
  return c.json({ items: rows.results });
});
app.post("/api/carrier/capacity", async (c) => {
  const u = c.get("user");
  roles(u, ["CARRIER"]);
  return c.json(
    await createOffer(
      c.env.DB,
      u,
      await c.req.json(),
      c.req.header("cf-connecting-ip") ?? null,
    ),
    201,
  );
});
app.post("/api/orders", async (c) => {
  const u = c.get("user");
  roles(u, ["CUSTOMER"]);
  const result = await createOrder(
    c.env.DB,
    u,
    await c.req.json(),
    c.req.header("Idempotency-Key") ?? null,
    c.req.header("cf-connecting-ip") ?? null,
  );
  return c.json(result, result.replayed ? 200 : 201);
});
app.get("/api/orders", async (c) => {
  const u = c.get("user");
  roles(u, ["CUSTOMER"]);
  const rows = await c.env.DB.prepare(
    "SELECT * FROM orders WHERE customer_company_id=? ORDER BY created_at DESC LIMIT 100",
  )
    .bind(u.customer_company_id ?? "")
    .all();
  return c.json({ items: rows.results.map(customerOrder) });
});
app.get("/api/orders/:id", async (c) => {
  const u = c.get("user");
  roles(u, ["CUSTOMER"]);
  const row = await c.env.DB.prepare(
    "SELECT * FROM orders WHERE id=? AND customer_company_id=?",
  )
    .bind(c.req.param("id"), u.customer_company_id ?? "")
    .first();
  if (!row) throw new Problem(404, "订单不存在");
  const tasks = await c.env.DB.prepare(
    "SELECT * FROM order_tasks WHERE order_id=? ORDER BY sequence",
  )
    .bind(row.id)
    .all();
  return c.json({ order: customerOrder(row), tasks: tasks.results });
});
app.use("/api/admin/*", async (c, next) => {
  roles(c.get("user"), platform);
  await next();
});
app.get("/api/admin/carriers", async (c) =>
  c.json({
    items: (
      await c.env.DB.prepare(
        "SELECT * FROM carriers ORDER BY created_at DESC LIMIT 100",
      ).all()
    ).results,
  }),
);
app.post("/api/admin/carriers/:id/review", async (c) => {
  roles(c.get("user"), reviewers);
  return c.json(
    await review(
      c.env.DB,
      c.get("user"),
      "Carrier",
      c.req.param("id"),
      await c.req.json(),
      c.req.header("cf-connecting-ip") ?? null,
    ),
  );
});
app.get("/api/admin/capacity", async (c) =>
  c.json({
    items: (
      await c.env.DB.prepare(
        `SELECT c.*,ca.company_name,oc.name AS origin_city,dc.name AS destination_city,v.name AS vehicle_type,r.service_fee_cents ${offerJoin} ORDER BY c.created_at DESC LIMIT 100`,
      ).all()
    ).results,
  }),
);
app.post("/api/admin/capacity/:id/review", async (c) => {
  roles(c.get("user"), reviewers);
  return c.json(
    await review(
      c.env.DB,
      c.get("user"),
      "CapacityOffer",
      c.req.param("id"),
      await c.req.json(),
      c.req.header("cf-connecting-ip") ?? null,
    ),
  );
});
app.get("/api/admin/orders", async (c) => {
  roles(c.get("user"), ["SUPER_ADMIN", "OPERATIONS", "FINANCE"]);
  return c.json({
    items: (
      await c.env.DB.prepare(
        "SELECT o.*,cc.company_name AS customer_company,ca.company_name AS carrier_company FROM orders o JOIN customer_companies cc ON cc.id=o.customer_company_id JOIN carriers ca ON ca.id=o.carrier_id ORDER BY o.created_at DESC LIMIT 100",
      ).all()
    ).results,
  });
});
app.get("/api/admin/orders/:id", async (c) => {
  roles(c.get("user"), ["SUPER_ADMIN", "OPERATIONS", "FINANCE"]);
  const row = await c.env.DB.prepare(
    "SELECT o.*,cc.company_name AS customer_company,ca.company_name AS carrier_company FROM orders o JOIN customer_companies cc ON cc.id=o.customer_company_id JOIN carriers ca ON ca.id=o.carrier_id WHERE o.id=?",
  )
    .bind(c.req.param("id"))
    .first();
  if (!row) throw new Problem(404, "订单不存在");
  return c.json({
    order: row,
    tasks: (
      await c.env.DB.prepare(
        "SELECT * FROM order_tasks WHERE order_id=? ORDER BY sequence",
      )
        .bind(row.id)
        .all()
    ).results,
  });
});
app.get("/api/admin/customers", async (c) => {
  roles(c.get("user"), ["SUPER_ADMIN", "OPERATIONS", "FINANCE"]);
  return c.json({
    items: (
      await c.env.DB.prepare(
        "SELECT * FROM customer_companies ORDER BY created_at DESC LIMIT 100",
      ).all()
    ).results,
  });
});
app.get("/api/admin/audit-logs", async (c) => {
  roles(c.get("user"), ["SUPER_ADMIN"]);
  return c.json({
    items: (
      await c.env.DB.prepare(
        "SELECT a.*,u.display_name AS operator_name FROM audit_logs a JOIN users u ON u.id=a.operator_id ORDER BY a.created_at DESC LIMIT 100",
      ).all()
    ).results,
  });
});
app.get("/api/admin/users", async (c) => {
  roles(c.get("user"), ["SUPER_ADMIN"]);
  return c.json({
    items: (
      await c.env.DB.prepare(
        `SELECT ${userFields},active,created_at FROM users ORDER BY created_at DESC LIMIT 100`,
      ).all()
    ).results,
  });
});
app.post("/api/admin/users", async (c) => {
  const u = c.get("user");
  roles(u, ["SUPER_ADMIN"]);
  const data = registerSchema
    .omit({ role: true })
    .extend({ role: z.enum(["OPERATIONS", "REVIEWER", "FINANCE"]) })
    .strict()
    .parse(await c.req.json());
  const id = crypto.randomUUID();
  await c.env.DB.batch([
    c.env.DB.prepare(
      "INSERT INTO users(id,email,display_name,role,password_hash) VALUES(?,?,?,?,?)",
    ).bind(
      id,
      data.email,
      data.display_name,
      data.role,
      await passwordHash(data.password),
    ),
    audit(
      c.env.DB,
      u,
      "User",
      id,
      "CREATE_PLATFORM_USER",
      null,
      { email: data.email, role: data.role },
      c.req.header("cf-connecting-ip") ?? null,
    ),
  ]);
  return c.json({ id }, 201);
});
for (const [path, table, schema] of [
  ["routes", "routes", routeSchema],
  ["vehicle-types", "vehicle_types", vehicleSchema],
] as const) {
  app.post(`/api/admin/${path}`, async (c) => {
    const u = c.get("user");
    roles(u, masters);
    const data = schema.parse(await c.req.json());
    const id = crypto.randomUUID();
    const values = { id, ...data };
    await c.env.DB.batch([
      c.env.DB.prepare(
        `INSERT INTO ${table}(${Object.keys(values).join(",")}) VALUES(${Object.keys(
          values,
        )
          .map(() => "?")
          .join(",")})`,
      ).bind(...Object.values(values)),
      audit(
        c.env.DB,
        u,
        table,
        id,
        "CREATE",
        null,
        data,
        c.req.header("cf-connecting-ip") ?? null,
      ),
    ]);
    return c.json({ id }, 201);
  });
  app.put(`/api/admin/${path}/:id`, async (c) => {
    const u = c.get("user");
    roles(u, masters);
    const data = schema.parse(await c.req.json());
    const id = c.req.param("id");
    const before = await c.env.DB.prepare(`SELECT * FROM ${table} WHERE id=?`)
      .bind(id)
      .first();
    if (!before) throw new Problem(404, "记录不存在");
    const result = await c.env.DB.batch([
      c.env.DB.prepare(
        `UPDATE ${table} SET ${Object.keys(data)
          .map((k) => `${k}=?`)
          .join(
            ",",
          )},updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND updated_at=? RETURNING id`,
      ).bind(...Object.values(data), id, before.updated_at),
      audit(
        c.env.DB,
        u,
        table,
        id,
        "UPDATE",
        before,
        data,
        c.req.header("cf-connecting-ip") ?? null,
        true,
      ),
    ]);
    if (!result[0].results.length) throw new Problem(409, "数据已变化，请刷新");
    return c.json({ id });
  });
}
app.all("/api/*", (c) => c.json({ error: "接口不存在" }, 404));
app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));
export default app;
