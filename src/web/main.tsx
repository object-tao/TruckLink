import React, {
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { createRoot } from "react-dom/client";
import {
  Truck,
  ArrowRight,
  Package,
  Search,
  ClipboardList,
  Route,
  Users,
  ShieldCheck,
  LogOut,
  Plus,
  Check,
  Clock,
  ChevronRight,
  Settings,
  LayoutDashboard,
} from "lucide-react";
import { api, money, labels } from "./api";
import { FulfillmentView, isFulfillmentPath } from "./fulfillment";
import type { User } from "../api/types";
import "./styles.css";
type Row = Record<string, any>;
type Field = {
  key: string;
  label: string;
  type?: string;
  value?: string | number;
  options?: { id: string; name: string }[];
  required?: boolean;
  min?: number;
  max?: number;
  step?: string;
};
const field = (
  key: string,
  label: string,
  type = "text",
  value?: string | number,
): Field => ({ key, label, type, value });
function Badge({ value }: { value: string }) {
  return (
    <span className={`badge ${value.toLowerCase()}`}>
      {labels[value] ?? value}
    </span>
  );
}
function Form({
  fields,
  onSubmit,
  submit = "保存",
  children,
  onFieldChange,
}: {
  fields: Field[];
  onSubmit: (data: Row) => Promise<void>;
  submit?: string;
  children?: ReactNode;
  onFieldChange?: (key: string, value: string) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const data: Row = {};
    for (const f of fields) {
      const value = form.get(f.key);
      data[f.key] = f.type === "number" ? Number(value) : value;
    }
    try {
      await onSubmit(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={send} className="form-grid">
      {fields.map((f) => (
        <label key={f.key}>
          {f.label}
          {f.options ? (
            <select
              aria-label={f.label}
              name={f.key}
              defaultValue={f.value ?? ""}
              required={f.required !== false}
            >
              <option value="">请选择</option>
              {f.options.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          ) : (
            <input
              aria-label={f.label}
              name={f.key}
              type={f.type ?? "text"}
              defaultValue={f.value}
              required={f.required !== false}
              min={f.min ?? (f.type === "number" ? 0 : undefined)}
              max={f.max}
              step={f.step ?? (f.type === "number" ? "1" : undefined)}
              autoComplete={
                f.type === "password" ? "current-password" : undefined
              }
              onChange={(event) =>
                onFieldChange?.(f.key, event.currentTarget.value)
              }
            />
          )}
        </label>
      ))}
      {children}
      {error && (
        <p className="error full" role="alert">
          {error}
        </p>
      )}
      <div className="full">
        <button disabled={busy} className="primary">
          {busy ? "正在提交…" : submit}
          <ArrowRight size={16} />
        </button>
      </div>
    </form>
  );
}
function App() {
  const [user, setUser] = useState<User | null>(null),
    [checking, setChecking] = useState(true),
    [path, setPath] = useState(location.pathname),
    [data, setData] = useState<Row>({}),
    [master, setMaster] = useState<Row>({
      routes: [],
      vehicle_types: [],
      countries: [],
      cities: [],
    }),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [revision, setRevision] = useState(0),
    [modal, setModal] = useState<ReactNode>(null),
    [notice, setNotice] = useState("");
  const navigate = (url: string) => {
    history.pushState({}, "", url);
    setPath(location.pathname);
    setModal(null);
    setError("");
  };
  const refresh = () => setRevision((x) => x + 1);
  useEffect(() => {
    const handler = () => setPath(location.pathname);
    window.addEventListener("popstate", handler);
    api("/auth/me")
      .then((x) => setUser(x.user))
      .catch(() => {})
      .finally(() => setChecking(false));
    return () => window.removeEventListener("popstate", handler);
  }, []);
  const home = (u: User) =>
    u.role === "CUSTOMER"
      ? "/home"
      : u.role === "CARRIER"
        ? "/carrier/home"
        : u.role === "REVIEWER"
          ? "/admin/tasks"
          : "/admin/dashboard";
  useEffect(() => {
    if (user && (path === "/" || path.endsWith("/login"))) navigate(home(user));
  }, [user, path]);
  useEffect(() => {
    if (!user) return;
    let alive = true;
    setLoading(true);
    setError("");
    setData({});
    async function load() {
      const m = await api("/master-data");
      if (!alive) return;
      setMaster(m);
      let result: Row = {};
      if (user!.role === "CUSTOMER") {
        if (path === "/company/setup") result = await api("/company");
        else if (path === "/orders") result = await api("/orders");
        else if (/^\/orders\/[^/]+\/tracking$/.test(path))
          result = await api(`/orders/${path.split("/")[2]}/tracking`);
        else if (path.startsWith("/orders/"))
          result = await api(`/orders/${path.split("/")[2]}`);
        else if (path.startsWith("/capacity/") && path !== "/capacity/list")
          result = await api(`/capacity/${path.split("/")[2]}`);
        else if (path === "/order/create") {
          const id = new URLSearchParams(location.search).get("offer");
          result = await api(`/capacity/${id}`);
        } else if (path === "/profile") result = await api("/company");
        else result = await api("/capacity" + location.search);
      } else if (user!.role === "CARRIER") {
        const profile = await api("/carrier/profile");
        const endpoint = path.startsWith("/carrier/orders/")
          ? `/carrier/orders/${path.split("/")[3]}`
          : path === "/carrier/orders" || path === "/carrier/home"
            ? "/carrier/orders"
            : path === "/carrier/vehicles"
              ? "/carrier/vehicles"
              : path === "/carrier/drivers"
                ? "/carrier/drivers"
                : path.startsWith("/carrier/tasks/")
                  ? `/carrier/tasks/${path.split("/")[3]}`
                  : "/carrier/capacity";
        result = { ...profile, ...(await api(endpoint)) };
      } else {
        const endpoint = path.startsWith("/admin/orders/")
          ? `/admin/orders/${path.split("/")[3]}`
          : path.startsWith("/admin/tasks/")
            ? `/admin/tasks/${path.split("/")[3]}`
            : path === "/admin/tasks"
              ? "/admin/tasks"
              : path === "/admin/vehicles"
                ? "/admin/vehicles"
                : path.includes("audit-logs")
                  ? "/admin/audit-logs"
                  : path.includes("/users")
                    ? "/admin/users"
                    : path.includes("customers")
                      ? "/admin/customers"
                      : path.includes("carriers")
                        ? "/admin/carriers"
                        : path.includes("capacity")
                          ? "/admin/capacity"
                          : path.includes("routes") ||
                              path.includes("vehicle-types")
                            ? null
                            : "/admin/orders";
        if (endpoint) result = await api(endpoint);
      }
      if (alive) setData(result);
    }
    load()
      .catch((e) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [user, path, revision]);
  async function done() {
    setModal(null);
    setNotice("操作已完成");
    refresh();
    setTimeout(() => setNotice(""), 3500);
  }
  const options = (key: string) =>
    master[key].map((x: Row) => ({
      id: x.id,
      name:
        key === "routes" ? `${x.origin_city} → ${x.destination_city}` : x.name,
    }));
  if (checking) return <div className="splash">TruckLink · 正在连接</div>;
  if (!user)
    return (
      <Login
        onLogin={(u) => {
          setUser(u);
          navigate(home(u));
        }}
      />
    );
  const admin = !["CUSTOMER", "CARRIER"].includes(user.role),
    carrier = user.role === "CARRIER",
    customer = user.role === "CUSTOMER";
  const links = customer
    ? [
        ["/home", "运力市场", Search],
        ["/orders", "我的订单", ClipboardList],
        ["/company/setup", "企业信息", Users],
        ["/profile", "账户设置", Settings],
      ]
    : carrier
      ? [
          ["/carrier/home", "工作台", LayoutDashboard],
          ["/carrier/orders", "待履约订单", ClipboardList],
          ["/carrier/vehicles", "车辆管理", Truck],
          ["/carrier/drivers", "司机管理", Users],
          ["/carrier/capacity", "我的运力", Truck],
          ["/carrier/capacity/create", "发布运力", Plus],
          ["/carrier/onboarding", "车队资料", Users],
          ["/profile", "账户设置", Settings],
        ]
      : [
          ...(user.role !== "REVIEWER"
            ? [
                ["/admin/dashboard", "工作概览", LayoutDashboard],
                ["/admin/orders", "订单管理", ClipboardList],
              ]
            : []),
          ["/admin/tasks", "履约任务", ClipboardList],
          ["/admin/vehicles", "车辆审核", Truck],
          ["/admin/capacity", "运力审核", ShieldCheck],
          ["/admin/carriers", "车队管理", Truck],
          ["/admin/routes", "线路管理", Route],
          ["/admin/master-data/vehicle-types", "车型管理", Package],
          ...(user.role === "SUPER_ADMIN"
            ? [
                ["/admin/users", "平台成员", Users],
                ["/admin/audit-logs", "操作日志", Clock],
              ]
            : []),
          ["/profile", "账户设置", Settings],
        ];
  const title = path.endsWith("/tracking")
    ? "运输轨迹"
    : path.startsWith("/carrier/tasks/") && path.endsWith("/vehicle")
      ? "车辆绑定"
      : path.startsWith("/carrier/tasks/") && path.endsWith("/events")
        ? "运输节点"
        : path.startsWith("/admin/tasks/")
          ? "履约任务详情"
          : path.startsWith("/orders/") ||
              path.startsWith("/admin/orders/") ||
              path.startsWith("/carrier/orders/")
            ? "订单详情"
            : path.startsWith("/capacity/") && path !== "/capacity/list"
              ? "运力详情"
              : path === "/order/create"
                ? "确认运输需求"
                : ((links.find((x) => x[0] === path)?.[1] as string) ??
                  "运力市场");
  const table = (headers: string[], rows: ReactNode[][]) => (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j} data-label={headers[j]}>
                  <div className="cell-value">{cell}</div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <Empty />}
    </div>
  );
  function reviewButtons(row: Row, kind: string) {
    if (
      !["SUPER_ADMIN", "REVIEWER"].includes(user!.role) ||
      !["PENDING", "PENDING_REVIEW"].includes(row.status)
    )
      return <span>—</span>;
    return (
      <div className="actions">
        <button
          onClick={() =>
            setModal(
              <>
                <h2>审核{kind === "carriers" ? "车队" : "运力"}</h2>
                <Form
                  fields={[
                    {
                      key: "decision",
                      label: "审核结果",
                      options: [
                        { id: "APPROVE", name: "通过" },
                        { id: "REJECT", name: "拒绝" },
                      ],
                    },
                    field("reason", "审核说明（拒绝必填）"),
                  ].map((f) =>
                    f.key === "reason" ? { ...f, required: false } : f,
                  )}
                  onSubmit={async (x) => {
                    await api(`/admin/${kind}/${row.id}/review`, "POST", x);
                    await done();
                  }}
                  submit="确认审核"
                />
              </>,
            )
          }
        >
          处理审核
        </button>
      </div>
    );
  }
  function orderTable(items: Row[]) {
    return table(
      [
        "订单编号",
        "运输线路",
        ...(admin ? ["客户"] : []),
        "车辆",
        "应付总额",
        "首款",
        "状态",
        "",
      ],
      items.map((o) => [
        <strong>{o.order_no}</strong>,
        o.route_snapshot,
        ...(admin ? [o.customer_company] : []),
        `${o.vehicle_count} 台`,
        money(o.total_amount_cents),
        money(o.deposit_amount_cents),
        <Badge value={o.status} />,
        <button
          className="text-button"
          onClick={() => navigate(`${admin ? "/admin" : ""}/orders/${o.id}`)}
        >
          查看 <ChevronRight size={14} />
        </button>,
      ]),
    );
  }
  function profile() {
    return (
      <section className="panel narrow">
        <h2>账户安全</h2>
        <button
          className="text-button"
          onClick={async () => {
            await api("/auth/logout", "POST", {});
            setUser(null);
            navigate("/login");
          }}
        >
          退出登录
        </button>
        <p>
          {user!.email} · {labels[user!.role]}
        </p>
        <Form
          fields={[
            field("current_password", "当前密码", "password"),
            field("new_password", "新密码（至少 12 位）", "password"),
          ]}
          submit="修改密码并重新登录"
          onSubmit={async (x) => {
            await api("/auth/password", "POST", x);
            setUser(null);
          }}
        />
      </section>
    );
  }
  let content: ReactNode;
  if (path === "/profile") content = profile();
  else if (isFulfillmentPath(user.role, path))
    content = (
      <FulfillmentView
        role={user.role}
        path={path}
        data={data}
        master={master}
        navigate={navigate}
        refresh={refresh}
      />
    );
  else if (data.order) {
    const o = data.order;
    content = (
      <>
        <button
          className="text-button"
          onClick={() => navigate(admin ? "/admin/orders" : "/orders")}
        >
          ← 返回订单列表
        </button>
        <section className="panel">
          <div className="section-head">
            <div>
              <p className="eyebrow">{o.order_no}</p>
              <h2>{o.route_snapshot}</h2>
            </div>
            <Badge value={o.status} />
          </div>
          <div className="summary-grid">
            <div>
              <small>合同总额</small>
              <strong>{money(o.total_amount_cents)}</strong>
            </div>
            <div>
              <small>首款 · {o.deposit_rate_snapshot / 100}%</small>
              <strong>{money(o.deposit_amount_cents)}</strong>
            </div>
            <div>
              <small>尾款</small>
              <strong>{money(o.balance_amount_cents)}</strong>
            </div>
            <div>
              <small>运输规模</small>
              <strong>{o.vehicle_count} 台</strong>
            </div>
          </div>
          <p className="note">
            订单已创建，价格已锁定。收付款功能将在后续阶段开放。
          </p>
          {customer && (
            <button
              className="text-button"
              onClick={() => navigate(`/orders/${o.id}/tracking`)}
            >
              查看运输轨迹 <ArrowRight size={15} />
            </button>
          )}
          <div className="detail-grid">
            <div>
              <h3>装货信息</h3>
              <p>
                {o.planned_loading_date} · {o.loading_address}
              </p>
              <p>
                {o.loading_contact} · {o.loading_phone}
              </p>
            </div>
            <div>
              <h3>卸货信息</h3>
              <p>{o.unloading_address}</p>
              <p>
                {o.unloading_contact} · {o.unloading_phone}
              </p>
            </div>
            <div>
              <h3>货物信息（每台车）</h3>
              <p>
                {o.cargo_name} · {o.cargo_weight_kg} kg · {o.cargo_quantity} 件
              </p>
              <p>
                {o.cargo_length_cm} × {o.cargo_width_cm} × {o.cargo_height_cm}{" "}
                cm
              </p>
            </div>
            {admin && (
              <div>
                <h3>平台价格快照</h3>
                <p>车队：{o.carrier_company}</p>
                <p>
                  成本 {money(o.carrier_unit_price_snapshot)} + 服务费{" "}
                  {money(o.service_fee_snapshot)} / 台
                </p>
              </div>
            )}
          </div>
          <h3>运输任务</h3>
          {table(
            ["任务编号", "计划装货日", "状态"],
            (data.tasks ?? []).map((t: Row) => [
              t.task_no,
              t.planned_loading_date,
              <Badge value={t.status} />,
            ]),
          )}
        </section>
      </>
    );
  } else if (customer && path === "/company/setup")
    content = (
      <section className="panel narrow">
        <h2>企业信息</h2>
        {data.company ? (
          <>
            <Badge value={data.company.status} />
            <h3>{data.company.company_name}</h3>
            <p>
              {data.company.contact_name} · {data.company.phone}
            </p>
            <button onClick={() => navigate("/home")}>
              前往运力市场 <ArrowRight size={16} />
            </button>
          </>
        ) : (
          <>
            <p>建档后即可预订跨境整车运力。</p>
            <Form
              fields={[
                field("company_name", "企业名称"),
                field("contact_name", "联系人"),
                field("phone", "联系电话"),
              ]}
              onSubmit={async (x) => {
                await api("/company", "POST", x);
                setUser((await api("/auth/me")).user);
                await done();
              }}
              submit="保存企业信息"
            />
          </>
        )}
      </section>
    );
  else if (customer && path === "/orders")
    content = orderTable(data.items ?? []);
  else if (customer && path === "/order/create")
    content = data.offer ? (
      <OrderForm
        offer={data.offer}
        onCreated={(id) => navigate(`/orders/${id}`)}
      />
    ) : null;
  else if (customer && data.offer) {
    const o = data.offer;
    content = (
      <section className="panel narrow">
        <p className="eyebrow">{o.offer_no} · 平台保障运力</p>
        <h2>
          {o.origin_city} → {o.destination_city}
        </h2>
        <p>
          {o.vehicle_type} · {o.loading_date} 装货 · {o.transit_days_min}–
          {o.transit_days_max} 天
        </p>
        <div className="price">
          {money(o.customer_unit_price_cents)} <small>/ 台</small>
        </div>
        <p>
          剩余 {o.remaining_capacity} 台 · 首款 {o.deposit_rate_bps / 100}%
        </p>
        {o.vehicle_category ? (
          <p>
            {o.vehicle_category} · {o.vehicle_model} · {o.line_count}线
            {o.axle_count}轴 · 有效长度 {o.effective_length_text}
            {o.effective_length_text === "无标准" ? "" : " 米"} · 有效方数{" "}
            {o.effective_volume_m3} m³ · 载重 {o.max_weight_kg} kg
          </p>
        ) : (
          <p>
            单车限重 {o.max_weight_kg} kg，尺寸 {o.max_length_cm} ×{" "}
            {o.max_width_cm} × {o.max_height_cm} cm
          </p>
        )}
        <p className="note">由平台统一承运与履约，供应商身份不对客户公开。</p>
        <button
          className="primary"
          onClick={() => navigate(`/order/create?offer=${o.id}`)}
        >
          预订运力 <ArrowRight size={16} />
        </button>
      </section>
    );
  } else if (customer)
    content = (
      <>
        <div className="market-intro">
          <div>
            <p className="eyebrow">CROSS-BORDER · FTL</p>
            <h2>跨越边境，连接生意。</h2>
            <p>明确的线路、真实的运力，让每一程都有把握。</p>
          </div>
          <div className="route-mark">
            <Truck size={32} />
            <span>
              中国 <ArrowRight size={18} /> 中亚
            </span>
          </div>
        </div>
        <section className="panel search-panel">
          <Form
            fields={[
              {
                key: "route_id",
                label: "运输线路",
                options: options("routes"),
                required: false,
              },
              {
                key: "vehicle_type_id",
                label: "车型",
                options: options("vehicle_types"),
                required: false,
              },
              { ...field("loading_date", "装货日期", "date"), required: false },
            ]}
            submit="搜索运力"
            onSubmit={async (x) => {
              const params = new URLSearchParams(
                Object.entries(x).filter(([, v]) => v),
              );
              history.replaceState({}, "", `/home?${params}`);
              setPath("/home");
              refresh();
            }}
          />
        </section>
        <div className="section-head">
          <h3>
            可用运力 <span className="count">{data.items?.length ?? 0}</span>
          </h3>
          <span className="muted">人民币报价 · 按台计费</span>
        </div>
        <div className="offer-grid">
          {(data.items ?? []).map((o: Row) => (
            <article className="offer-card" key={o.id}>
              <div className="section-head">
                <span className="route-code">{o.route_code}</span>
                <Badge value="AVAILABLE" />
              </div>
              <h3>
                {o.origin_city} <ArrowRight size={20} /> {o.destination_city}
              </h3>
              <p>
                <Truck size={16} /> {o.vehicle_type}
              </p>
              <div className="offer-facts">
                <span>
                  <small>装货日期</small>
                  {o.loading_date}
                </span>
                <span>
                  <small>预计时效</small>
                  {o.transit_days_min}–{o.transit_days_max} 天
                </span>
                <span>
                  <small>剩余运力</small>
                  {o.remaining_capacity} 台
                </span>
              </div>
              <div className="offer-bottom">
                <div>
                  <strong>{money(o.customer_unit_price_cents)}</strong>
                  <small> / 台</small>
                </div>
                <button onClick={() => navigate(`/capacity/${o.id}`)}>
                  查看方案 <ArrowRight size={15} />
                </button>
              </div>
            </article>
          ))}
        </div>
        {!data.items?.length && (
          <Empty text="暂时没有符合条件的运力，试试其他线路或日期。" />
        )}
      </>
    );
  else if (carrier) {
    if (path === "/carrier/onboarding" || !data.carrier)
      content = (
        <section className="panel narrow">
          <h2>车队入驻</h2>
          {data.carrier ? (
            <>
              <Badge value={data.carrier.status} />
              <h3>{data.carrier.company_name}</h3>
              <p>
                {data.carrier.contact_name} · {data.carrier.phone}
              </p>
              <p className="note">车队审核通过后即可发布运力。</p>
            </>
          ) : (
            <Form
              fields={[
                field("company_name", "车队企业名称"),
                {
                  key: "country_id",
                  label: "所在国家",
                  options: options("countries"),
                },
                field("contact_name", "联系人"),
                field("phone", "联系电话"),
              ]}
              submit="提交入驻审核"
              onSubmit={async (x) => {
                await api("/carrier/onboarding", "POST", x);
                setUser((await api("/auth/me")).user);
                await done();
              }}
            />
          )}
        </section>
      );
    else if (path === "/carrier/capacity/create")
      content = (
        <section className="panel narrow">
          <h2>发布可售运力</h2>
          <p className="note">
            审核通过即为真实履约承诺，请确保车辆数量及装货日期准确。
          </p>
          {data.carrier.status !== "ACTIVE" ? (
            <p>请等待车队审核通过后发布。</p>
          ) : (
            <Form
              fields={[
                { key: "route_id", label: "线路", options: options("routes") },
                {
                  key: "vehicle_type_id",
                  label: "车型",
                  options: options("vehicle_types"),
                },
                field("loading_date", "装货日期", "date"),
                {
                  ...field("carrier_price", "车队报价（元 / 台）", "number"),
                  step: "0.01",
                  min: 0.01,
                },
                field("total_capacity", "可用车辆数", "number", 5),
                field("transit_days_min", "最短时效（天）", "number", 3),
                field("transit_days_max", "最长时效（天）", "number", 5),
                field(
                  "valid_until",
                  "报价有效期（本地时间）",
                  "datetime-local",
                ),
              ]}
              submit="提交运力审核"
              onSubmit={async (x) => {
                const { carrier_price, ...rest } = x;
                await api("/carrier/capacity", "POST", {
                  ...rest,
                  carrier_price_cents: Math.round(carrier_price * 100),
                  valid_until: new Date(x.valid_until).toISOString(),
                });
                navigate("/carrier/capacity");
                refresh();
              }}
            />
          )}
        </section>
      );
    else
      content = (
        <>
          <div className="section-head">
            <div>
              <h2>{data.carrier.company_name}</h2>
              <p className="muted">管理运力供应，查看审核与销售状态。</p>
            </div>
            <button
              className="primary"
              onClick={() => navigate("/carrier/capacity/create")}
            >
              <Plus size={16} />
              发布运力
            </button>
          </div>
          {table(
            [
              "编号 / 线路",
              "装货日期",
              "车型",
              "车队价 / 台",
              "剩余 / 总量",
              "状态",
              "审核说明",
            ],
            (data.items ?? []).map((o: Row) => [
              <>
                <strong>{o.offer_no}</strong>
                <small>
                  {o.origin_city} → {o.destination_city}
                </small>
              </>,
              o.loading_date,
              o.vehicle_type,
              money(o.carrier_price_cents),
              `${o.remaining_capacity} / ${o.total_capacity}`,
              <Badge value={o.status} />,
              o.review_reason || "—",
            ]),
          )}
        </>
      );
  } else if (path.includes("audit-logs"))
    content = table(
      ["时间", "操作人", "模块", "动作", "对象"],
      (data.items ?? []).map((r: Row) => [
        new Date(r.created_at).toLocaleString(),
        r.operator_name,
        r.module,
        r.action,
        <span className="mono">{r.object_id}</span>,
      ]),
    );
  else if (path.includes("/users"))
    content = (
      <>
        <div className="section-head">
          <p>平台角色按职责分离，公开注册仅允许客户和车队。</p>
          <button
            onClick={() =>
              setModal(
                <>
                  <h2>新增平台成员</h2>
                  <Form
                    fields={[
                      field("display_name", "姓名"),
                      field("email", "邮箱", "email"),
                      field("password", "初始密码（至少 12 位）", "password"),
                      {
                        key: "role",
                        label: "角色",
                        options: ["OPERATIONS", "REVIEWER", "FINANCE"].map(
                          (id) => ({ id, name: labels[id] }),
                        ),
                      },
                    ]}
                    onSubmit={async (x) => {
                      await api("/admin/users", "POST", x);
                      await done();
                    }}
                  />
                </>,
              )
            }
          >
            <Plus size={16} />
            新增成员
          </button>
        </div>
        {table(
          ["姓名", "邮箱", "角色"],
          (data.items ?? []).map((r: Row) => [
            r.display_name,
            r.email,
            <Badge value={r.role} />,
          ]),
        )}
      </>
    );
  else if (path.includes("carriers"))
    content = table(
      ["企业名称", "联系人", "电话", "状态", "操作"],
      (data.items ?? []).map((r: Row) => [
        r.company_name,
        r.contact_name,
        r.phone,
        <Badge value={r.status} />,
        reviewButtons(r, "carriers"),
      ]),
    );
  else if (path.includes("capacity") || user.role === "REVIEWER")
    content = table(
      [
        "线路 / 编号",
        "供应车队",
        "装货日期",
        "车队报价",
        "库存",
        "状态",
        "操作",
      ],
      (data.items ?? []).map((r: Row) => [
        <>
          <strong>
            {r.origin_city} → {r.destination_city}
          </strong>
          <small>{r.offer_no}</small>
        </>,
        r.company_name,
        r.loading_date,
        money(r.carrier_price_cents),
        `${r.remaining_capacity} / ${r.total_capacity}`,
        <Badge value={r.status} />,
        reviewButtons(r, "capacity"),
      ]),
    );
  else if (path.includes("routes") || path.includes("vehicle-types")) {
    const isRoute = path.includes("routes");
    const list = isRoute ? master.routes : master.vehicle_types;
    const edit = (row?: Row) => {
      const fields: Field[] = isRoute
        ? [
            field("route_code", "线路编号"),
            {
              key: "origin_country_id",
              label: "起始国家",
              options: options("countries"),
            },
            {
              key: "origin_city_id",
              label: "起始城市",
              options: options("cities"),
            },
            {
              key: "destination_country_id",
              label: "目的国家",
              options: options("countries"),
            },
            {
              key: "destination_city_id",
              label: "目的城市",
              options: options("cities"),
            },
            {
              ...field("service_fee", "服务费（元 / 台）", "number", 800),
              step: "0.01",
            },
            {
              ...field("deposit_rate", "首款比例（%）", "number", 30),
              max: 100,
              step: "0.01",
            },
          ]
        : [
            field("code", "车型编码"),
            field("name", "车型名称"),
            field("max_weight_kg", "最大载重（kg）", "number"),
            field("max_length_cm", "最大长度（cm）", "number"),
            field("max_width_cm", "最大宽度（cm）", "number"),
            field("max_height_cm", "最大高度（cm）", "number"),
          ];
      fields.push({
        key: "status",
        label: "状态",
        value: "ACTIVE",
        options: (isRoute
          ? ["ACTIVE", "PAUSED", "DISABLED"]
          : ["ACTIVE", "DISABLED"]
        ).map((id) => ({ id, name: labels[id] })),
      });
      setModal(
        <>
          <h2>
            {row ? "编辑" : "新增"}
            {isRoute ? "线路" : "车型"}
          </h2>
          <Form
            fields={fields.map((f) => ({
              ...f,
              value: row
                ? f.key === "service_fee"
                  ? row.service_fee_cents / 100
                  : f.key === "deposit_rate"
                    ? row.deposit_rate_bps / 100
                    : row[f.key]
                : f.value,
            }))}
            onSubmit={async (x) => {
              let payload = x;
              if (isRoute) {
                const { service_fee, deposit_rate, ...rest } = x;
                payload = {
                  ...rest,
                  service_fee_cents: Math.round(service_fee * 100),
                  deposit_rate_bps: Math.round(deposit_rate * 100),
                };
              }
              await api(
                `/admin/${isRoute ? "routes" : "vehicle-types"}${row ? "/" + row.id : ""}`,
                row ? "PUT" : "POST",
                payload,
              );
              await done();
            }}
          />
        </>,
      );
    };
    const can = ["SUPER_ADMIN", "OPERATIONS"].includes(user.role);
    content = (
      <>
        <div className="section-head">
          <p className="muted">
            {isRoute
              ? "价格变更只影响新订单，已成交订单保留快照。"
              : "车型目录保留分类、线轴、有效长度、方数和载重；已成交订单保留车型快照。"}
          </p>
          {can && (
            <button onClick={() => edit()}>
              <Plus size={16} />
              新增
            </button>
          )}
        </div>
        {table(
          isRoute
            ? ["编号", "线路", "服务费 / 台", "首款比例", "状态", ""]
            : [
                "编号",
                "分类 / 车型",
                "线 / 轴",
                "有效长度",
                "有效方数",
                "载重",
                "状态",
                "",
              ],
          list.map((r: Row) =>
            isRoute
              ? [
                  r.route_code,
                  `${r.origin_city} → ${r.destination_city}`,
                  money(r.service_fee_cents),
                  `${r.deposit_rate_bps / 100}%`,
                  <Badge value={r.status} />,
                  can && <button onClick={() => edit(r)}>编辑</button>,
                ]
              : [
                  r.code,
                  <>
                    <strong>{r.category || "原有车型"}</strong>
                    <small>{r.model_name || r.name}</small>
                  </>,
                  r.line_count ? `${r.line_count} / ${r.axle_count}` : "—",
                  r.effective_length_text
                    ? `${r.effective_length_text}${r.effective_length_text === "无标准" ? "" : " 米"}`
                    : `${r.max_length_cm / 100} 米`,
                  r.effective_volume_m3 ? `${r.effective_volume_m3} m³` : "—",
                  `${r.max_weight_kg} kg`,
                  <Badge value={r.status} />,
                  can ? (
                    <div className="actions">
                      <button onClick={() => edit(r)}>编辑</button>
                      <button
                        className="danger"
                        onClick={async () => {
                          if (
                            !window.confirm(
                              `确定删除车型“${r.model_name || r.name || r.code}”吗？已被运力或车辆引用的车型不能删除。`,
                            )
                          )
                            return;
                          try {
                            await api(`/admin/vehicle-types/${r.id}`, "DELETE");
                            await done();
                          } catch (e) {
                            setError((e as Error).message);
                          }
                        }}
                      >
                        删除
                      </button>
                    </div>
                  ) : (
                    <span>—</span>
                  ),
                ],
          ),
        )}
      </>
    );
  } else
    content = (
      <>
        {path === "/admin/dashboard" && (
          <div className="dashboard-summary">
            <div>
              <small>当前订单（最近 100 条）</small>
              <strong>{data.items?.length ?? 0}</strong>
            </div>
            <div>
              <small>订单金额</small>
              <strong>
                {money(
                  (data.items ?? []).reduce(
                    (s: number, o: Row) => s + o.total_amount_cents,
                    0,
                  ),
                )}
              </strong>
            </div>
            <div>
              <small>待付首款</small>
              <strong>
                {
                  (data.items ?? []).filter(
                    (o: Row) => o.status === "PAYMENT_PENDING",
                  ).length
                }
              </strong>
            </div>
          </div>
        )}
        {orderTable(data.items ?? [])}
      </>
    );
  return (
    <div className={`app-shell ${admin ? "admin-shell" : "mobile-shell"}`}>
      <aside className="sidebar">
        <a
          className="brand"
          href={home(user)}
          onClick={(e) => {
            e.preventDefault();
            navigate(home(user));
          }}
        >
          <span>
            <Truck size={23} />
          </span>
          TruckLink<span className="brand-dot">.</span>
        </a>
        <div className="workspace-label">
          {admin
            ? "PLATFORM CONSOLE"
            : carrier
              ? "CARRIER WORKSPACE"
              : "CROSS-BORDER FREIGHT"}
        </div>
        <nav>
          {links.map(([href, label, Icon]) => {
            const I = Icon as typeof Truck;
            return (
              <button
                key={href as string}
                className={path === href ? "selected" : ""}
                onClick={() => navigate(href as string)}
              >
                <I size={19} />
                {label as string}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <span className="avatar">{user.display_name.slice(0, 1)}</span>
          <div>
            <strong>{user.display_name}</strong>
            <small>{labels[user.role]}</small>
          </div>
          <button
            title="退出登录"
            onClick={async () => {
              await api("/auth/logout", "POST", {});
              setUser(null);
              navigate("/login");
            }}
          >
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      <div className="main-area">
        <header>
          <div>
            <span className="muted">
              {admin ? "平台管理" : carrier ? "车队中心" : "客户中心"}
            </span>
            <ChevronRight size={14} />
            <strong>{title}</strong>
          </div>
          <span className="header-pill">
            <span />
            服务已连接
          </span>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <p className="eyebrow">
                TRUCKLINK /{" "}
                {admin ? "OPERATIONS" : carrier ? "SUPPLY" : "MARKETPLACE"}
              </p>
              <h1>{title}</h1>
            </div>
            <span className="date">
              {new Date().toLocaleDateString("zh-CN", {
                month: "long",
                day: "numeric",
                weekday: "long",
              })}
            </span>
          </div>
          {notice && (
            <div className="success">
              <Check size={16} />
              {notice}
            </div>
          )}
          {error ? (
            <div className="error" role="alert">
              {error}
              <button onClick={refresh}>重试</button>
            </div>
          ) : loading ? (
            <div className="loading">正在加载最新数据…</div>
          ) : (
            content
          )}
        </main>
        <footer>
          TruckLink · 跨境整车运输 <span>中国出发，连接更远。</span>
        </footer>
      </div>
      {modal && (
        <div className="modal-backdrop" onClick={() => setModal(null)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="close"
              onClick={() => setModal(null)}
              aria-label="关闭"
            >
              ×
            </button>
            {modal}
          </div>
        </div>
      )}
    </div>
  );
}
function Empty({
  text = "暂无记录，新的业务记录会显示在这里。",
}: {
  text?: string;
}) {
  return (
    <div className="empty">
      <Package size={30} />
      <h3>还没有数据</h3>
      <p>{text}</p>
    </div>
  );
}
function Login({ onLogin }: { onLogin: (user: User) => void }) {
  const [register, setRegister] = useState(false),
    [notice, setNotice] = useState("");
  return (
    <div className="login">
      <section className="login-story">
        <a className="brand">
          <span>
            <Truck size={25} />
          </span>
          TruckLink.
        </a>
        <div>
          <p className="eyebrow">CROSS-BORDER TRUCKING</p>
          <h1>
            让跨境运输，
            <br />
            像出发一样简单。
          </h1>
          <p>
            真实运力，透明价格。
            <br />
            连接中国与中亚的每一程。
          </p>
          <div className="journey">
            <span>霍尔果斯</span>
            <i />
            <Truck size={28} />
            <i />
            <span>阿拉木图</span>
          </div>
        </div>
        <small>FTL 整车运输 · 平台统一履约</small>
      </section>
      <section className="login-form">
        <div>
          <p className="eyebrow">WELCOME TO TRUCKLINK</p>
          <h2>{register ? "创建你的账户" : "欢迎回来"}</h2>
          <p className="muted">
            {register
              ? "选择身份，开始你的第一程。"
              : "登录后管理你的运输业务。"}
          </p>
          {notice && <p className="success">{notice}</p>}
          <Form
            fields={[
              ...(register
                ? [
                    field("display_name", "姓名"),
                    {
                      key: "role",
                      label: "账户身份",
                      options: [
                        { id: "CUSTOMER", name: "客户 · 预订运输" },
                        { id: "CARRIER", name: "车队 · 提供运力" },
                      ],
                    },
                  ]
                : []),
              field("email", "邮箱", "email"),
              field("password", "密码（至少 12 位）", "password"),
            ]}
            submit={register ? "创建账户" : "登录"}
            onSubmit={async (x) => {
              if (register) {
                await api("/auth/register", "POST", x);
                setNotice("账户已创建，请登录");
                setRegister(false);
              } else onLogin((await api("/auth/login", "POST", x)).user);
            }}
          />
          <button
            className="text-button switch-auth"
            onClick={() => {
              setRegister(!register);
              setNotice("");
            }}
          >
            {register ? "已有账户？返回登录" : "还没有账户？注册客户或车队"}
          </button>
        </div>
      </section>
    </div>
  );
}
function OrderForm({
  offer,
  onCreated,
}: {
  offer: Row;
  onCreated: (id: string) => void;
}) {
  const [key] = useState(() => crypto.randomUUID());
  const [count, setCount] = useState(1);
  const total = offer.customer_unit_price_cents * count;
  const deposit = Math.floor((total * offer.deposit_rate_bps + 5000) / 10000);
  return (
    <div className="checkout">
      <section className="panel">
        <h2>
          {offer.origin_city} → {offer.destination_city}
        </h2>
        <p>
          {offer.vehicle_type} · {offer.loading_date} 装货
        </p>
        <p className="note">
          货物重量、尺寸与件数均按每台车填写。同一订单的各台车采用相同申报信息。
        </p>
        <Form
          fields={[
            {
              ...field("vehicle_count", "预订台数", "number", 1),
              min: 1,
              max: offer.remaining_capacity,
            },
            field("cargo_name", "货物名称"),
            {
              ...field("cargo_weight_kg", "每车重量（kg）", "number"),
              min: 1,
              max: offer.max_weight_kg,
            },
            { ...field("cargo_quantity", "每车件数", "number"), min: 1 },
            {
              ...field("cargo_length_cm", "每车货物长度（cm）", "number"),
              min: 1,
              max: offer.max_length_cm,
            },
            {
              ...field("cargo_width_cm", "每车货物宽度（cm）", "number"),
              min: 1,
              max: offer.dimension_limits_complete
                ? offer.max_width_cm
                : undefined,
            },
            {
              ...field("cargo_height_cm", "每车货物高度（cm）", "number"),
              min: 1,
              max: offer.dimension_limits_complete
                ? offer.max_height_cm
                : undefined,
            },
            field("loading_address", "装货地址"),
            field("loading_contact", "装货联系人"),
            field("loading_phone", "装货电话"),
            field("unloading_address", "卸货地址"),
            field("unloading_contact", "卸货联系人"),
            field("unloading_phone", "卸货电话"),
            { ...field("cargo_remark", "备注"), required: false },
          ]}
          submit="确认并创建订单"
          onFieldChange={(key, value) => {
            if (key === "vehicle_count") setCount(Number(value) || 1);
          }}
          onSubmit={async (x) => {
            const result = await api(
              "/orders",
              "POST",
              { capacity_offer_id: offer.id, ...x },
              key,
            );
            onCreated(result.order.id);
          }}
        ></Form>
      </section>
      <aside className="panel checkout-summary">
        <p className="eyebrow">费用预览</p>
        <h3>
          {money(offer.customer_unit_price_cents)} <small>/ 台</small>
        </h3>
        <p>
          预订 {count} 台 · 剩余 {offer.remaining_capacity} 台
        </p>
        <dl>
          <dt>总额</dt>
          <dd>{money(total)}</dd>
          <dt>首款（{offer.deposit_rate_bps / 100}%）</dt>
          <dd>{money(deposit)}</dd>
          <dt>尾款</dt>
          <dd>{money(total - deposit)}</dd>
        </dl>
        <small>费用随预订台数更新，最终金额以提交时的订单快照为准。</small>
        <p>
          <ShieldCheck size={16} />
          平台统一承运
        </p>
      </aside>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
