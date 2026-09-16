import React, { useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  MapPin,
  Plus,
  Truck,
  UserRound,
} from "lucide-react";
import { api, labels, money } from "./api";

type Row = Record<string, any>;
type Props = {
  role: string;
  path: string;
  data: Row;
  master: Row;
  navigate: (path: string) => void;
  refresh: () => void;
};

const Badge = ({ value }: { value: string }) => (
  <span className={`badge ${value.toLowerCase()}`}>
    {labels[value] ?? value}
  </span>
);

function GridTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: ReactNode[][];
}) {
  return (
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
      {!rows.length && (
        <div className="empty">
          <Truck size={30} />
          <h3>暂无记录</h3>
          <p>相关履约记录会显示在这里。</p>
        </div>
      )}
    </div>
  );
}

function Dialog({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  return (
    <div className="modal-backdrop" onClick={close}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="close" onClick={close} aria-label="关闭">
          ×
        </button>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

function ActionForm({
  children,
  submit,
  action,
}: {
  children: ReactNode;
  submit: string;
  action: (form: FormData) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await action(new FormData(event.currentTarget));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="form-grid" onSubmit={send}>
      {children}
      {error && (
        <p className="error full" role="alert">
          {error}
        </p>
      )}
      <div className="full">
        <button className="primary" disabled={busy}>
          {busy ? "正在提交…" : submit}
          <ArrowRight size={16} />
        </button>
      </div>
    </form>
  );
}

const taskPathId = (path: string) => path.split("/")[3];
const eventTypes = [
  "LOADED",
  "CUSTOMS_DECLARATION_STARTED",
  "CUSTOMS_CLEARED",
  "ENTERED_BORDER_ZONE",
  "WAITING_EXIT",
  "CHINA_EXITED",
  "FOREIGN_ENTERED",
  "TRANSIT_CUSTOMS",
  "IN_TRANSIT",
];

export function isFulfillmentPath(role: string, path: string) {
  if (role === "CUSTOMER") return /^\/orders\/[^/]+\/tracking$/.test(path);
  if (role === "CARRIER")
    return (
      path === "/carrier/home" ||
      path.startsWith("/carrier/orders") ||
      path.startsWith("/carrier/tasks/") ||
      path === "/carrier/vehicles" ||
      path === "/carrier/drivers"
    );
  return path.startsWith("/admin/tasks") || path === "/admin/vehicles";
}

export function FulfillmentView({
  role,
  path,
  data,
  master,
  navigate,
  refresh,
}: Props) {
  const [dialog, setDialog] = useState<ReactNode>(null);
  const close = () => setDialog(null);
  const complete = () => {
    close();
    refresh();
  };

  if (role === "CUSTOMER") {
    const order = data.order;
    if (!order) return <div className="loading">正在加载运输轨迹…</div>;
    const grouped = new Map<string, Row[]>();
    for (const event of data.events ?? [])
      grouped.set(event.order_task_id, [
        ...(grouped.get(event.order_task_id) ?? []),
        event,
      ]);
    return (
      <>
        <button
          className="text-button"
          onClick={() => navigate(`/orders/${order.id}`)}
        >
          ← 返回订单详情
        </button>
        <section className="panel tracking-panel">
          <div className="section-head">
            <div>
              <p className="eyebrow">{order.order_no}</p>
              <h2>{order.route_snapshot}</h2>
            </div>
            <Badge value={order.status} />
          </div>
          <p className="note">
            运输轨迹只展示业务节点，不公开车辆、司机及操作人员身份。
          </p>
          {(data.tasks ?? []).map((task: Row) => (
            <div className="task-track" key={task.id}>
              <div className="section-head">
                <h3>{task.task_no}</h3>
                <Badge value={task.status} />
              </div>
              <div className="timeline">
                {(grouped.get(task.id) ?? []).map((event) => (
                  <div className="timeline-item" key={event.id}>
                    <span className="timeline-dot" />
                    <div>
                      <strong>
                        {labels[event.event_type] ?? event.event_type}
                      </strong>
                      <small>
                        {new Date(event.event_time).toLocaleString("zh-CN")} ·{" "}
                        {[
                          event.country_name,
                          event.city_name,
                          event.location_text,
                        ]
                          .filter(Boolean)
                          .join(" / ")}
                      </small>
                      {event.remark && <p>{event.remark}</p>}
                    </div>
                  </div>
                ))}
                {!grouped.get(task.id)?.length && (
                  <p className="muted">车辆确认后将开始记录运输节点。</p>
                )}
              </div>
            </div>
          ))}
        </section>
      </>
    );
  }

  if (role === "CARRIER") {
    if (path === "/carrier/vehicles")
      return (
        <>
          <div className="section-head">
            <p className="muted">
              车辆提交后由平台审核，通过后可用于订单任务。
            </p>
            <button
              onClick={() =>
                setDialog(
                  <Dialog title="登记车辆" close={close}>
                    <ActionForm
                      submit="提交车辆审核"
                      action={async (f) => {
                        await api("/carrier/vehicles", "POST", {
                          plate_number: f.get("plate_number"),
                          country_id: f.get("country_id"),
                          vehicle_type_id: f.get("vehicle_type_id"),
                        });
                        complete();
                      }}
                    >
                      <label>
                        车牌号
                        <input name="plate_number" required />
                      </label>
                      <label>
                        注册国家
                        <select name="country_id" required>
                          <option value="">请选择</option>
                          {(master.countries ?? []).map((x: Row) => (
                            <option key={x.id} value={x.id}>
                              {x.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        车型
                        <select name="vehicle_type_id" required>
                          <option value="">请选择</option>
                          {(master.vehicle_types ?? []).map((x: Row) => (
                            <option key={x.id} value={x.id}>
                              {x.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </ActionForm>
                  </Dialog>,
                )
              }
            >
              <Plus size={16} />
              登记车辆
            </button>
          </div>
          <GridTable
            headers={["车牌", "车型", "国家", "状态", "审核说明"]}
            rows={(data.items ?? []).map((x: Row) => [
              <strong>{x.plate_number}</strong>,
              x.vehicle_type,
              x.country_name,
              <Badge value={x.status} />,
              x.review_reason || "—",
            ])}
          />
          {dialog}
        </>
      );
    if (path === "/carrier/drivers")
      return (
        <>
          <div className="section-head">
            <p className="muted">司机信息仅对所属车队和履约审核人员可见。</p>
            <button
              onClick={() =>
                setDialog(
                  <Dialog title="新增司机" close={close}>
                    <ActionForm
                      submit="保存司机"
                      action={async (f) => {
                        await api("/carrier/drivers", "POST", {
                          name: f.get("name"),
                          phone: f.get("phone"),
                          id_number: f.get("id_number"),
                        });
                        complete();
                      }}
                    >
                      <label>
                        姓名
                        <input name="name" required />
                      </label>
                      <label>
                        联系电话
                        <input name="phone" required />
                      </label>
                      <label>
                        证件号码
                        <input name="id_number" required />
                      </label>
                    </ActionForm>
                  </Dialog>,
                )
              }
            >
              <Plus size={16} />
              新增司机
            </button>
          </div>
          <GridTable
            headers={["司机", "电话", "证件", "状态"]}
            rows={(data.items ?? []).map((x: Row) => [
              <strong>{x.name}</strong>,
              x.phone,
              x.id_number_masked,
              <Badge value={x.status} />,
            ])}
          />
          {dialog}
        </>
      );
    if (path.startsWith("/carrier/tasks/")) {
      const task = data.task;
      if (!task) return <div className="loading">正在加载运输任务…</div>;
      const events = data.events ?? data.items ?? [];
      if (path.endsWith("/vehicle"))
        return (
          <>
            <button
              className="text-button"
              onClick={() => navigate(`/carrier/orders/${task.order_id}`)}
            >
              ← 返回订单
            </button>
            <section className="panel narrow">
              <div className="section-head">
                <div>
                  <p className="eyebrow">{task.task_no}</p>
                  <h2>绑定车辆和司机</h2>
                </div>
                <Badge value={task.status} />
              </div>
              <p className="note">
                计划装货日 {task.planned_loading_date}，请最迟于{" "}
                {task.assignment_due_at?.slice(0, 10)}{" "}
                完成绑定。更换车辆后会重新进入平台审核。
              </p>
              <ActionForm
                submit={task.vehicle_id ? "提交车辆变更" : "提交车辆绑定"}
                action={async (f) => {
                  await api(`/carrier/tasks/${task.id}/assignment`, "POST", {
                    vehicle_id: f.get("vehicle_id"),
                    driver_id: f.get("driver_id"),
                  });
                  navigate(`/carrier/orders/${task.order_id}`);
                  refresh();
                }}
              >
                <label>
                  车辆
                  <select
                    name="vehicle_id"
                    defaultValue={task.vehicle_id ?? ""}
                    required
                  >
                    <option value="">请选择</option>
                    {(data.vehicles ?? [])
                      .filter(
                        (x: Row) => x.vehicle_type_id === task.vehicle_type_id,
                      )
                      .map((x: Row) => (
                        <option key={x.id} value={x.id}>
                          {x.plate_number} · {x.vehicle_type} ·{" "}
                          {labels[x.status]}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  司机
                  <select
                    name="driver_id"
                    defaultValue={task.driver_id ?? ""}
                    required
                  >
                    <option value="">请选择</option>
                    {(data.drivers ?? []).map((x: Row) => (
                      <option key={x.id} value={x.id}>
                        {x.name} · {x.phone}
                      </option>
                    ))}
                  </select>
                </label>
              </ActionForm>
            </section>
          </>
        );
      return (
        <>
          <button
            className="text-button"
            onClick={() => navigate(`/carrier/orders/${task.order_id}`)}
          >
            ← 返回订单
          </button>
          <section className="panel">
            <div className="section-head">
              <div>
                <p className="eyebrow">{task.task_no}</p>
                <h2>运输节点</h2>
              </div>
              <Badge value={task.status} />
            </div>
            {["READY_FOR_LOADING", "LOADED", "IN_TRANSIT"].includes(
              task.status,
            ) && (
              <ActionForm
                submit="记录运输节点"
                action={async (f) => {
                  await api(
                    `/carrier/tasks/${task.id}/events`,
                    "POST",
                    {
                      event_type: f.get("event_type"),
                      event_time: new Date(
                        String(f.get("event_time")),
                      ).toISOString(),
                      country_id: f.get("country_id") || null,
                      city_id: f.get("city_id") || null,
                      location_text: f.get("location_text"),
                      remark: f.get("remark"),
                    },
                    crypto.randomUUID(),
                  );
                  refresh();
                }}
              >
                <label>
                  节点类型
                  <select name="event_type" required>
                    {eventTypes.map((x) => (
                      <option key={x} value={x}>
                        {labels[x] ?? x}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  发生时间
                  <input
                    name="event_time"
                    type="datetime-local"
                    defaultValue={new Date(
                      Date.now() - new Date().getTimezoneOffset() * 60000,
                    )
                      .toISOString()
                      .slice(0, 16)}
                    required
                  />
                </label>
                <label>
                  国家
                  <select name="country_id">
                    <option value="">请选择</option>
                    {(master.countries ?? []).map((x: Row) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  城市
                  <select name="city_id">
                    <option value="">请选择</option>
                    {(master.cities ?? []).map((x: Row) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="full">
                  具体位置
                  <input name="location_text" required />
                </label>
                <label className="full">
                  备注
                  <input name="remark" />
                </label>
              </ActionForm>
            )}
            <div className="timeline">
              {events.map((event: Row) => (
                <div className="timeline-item" key={event.id}>
                  <span className="timeline-dot" />
                  <div>
                    <strong>
                      {labels[event.event_type] ?? event.event_type}
                    </strong>
                    <small>
                      {new Date(event.event_time).toLocaleString("zh-CN")} ·{" "}
                      {[
                        event.country_name,
                        event.city_name,
                        event.location_text,
                      ]
                        .filter(Boolean)
                        .join(" / ")}
                    </small>
                    {event.remark && <p>{event.remark}</p>}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      );
    }
    if (data.order) {
      const order = data.order;
      return (
        <>
          <button
            className="text-button"
            onClick={() => navigate("/carrier/orders")}
          >
            ← 返回待履约订单
          </button>
          <section className="panel">
            <div className="section-head">
              <div>
                <p className="eyebrow">{order.order_no}</p>
                <h2>{order.route_snapshot}</h2>
              </div>
              <Badge value={order.status} />
            </div>
            <div className="summary-grid">
              <div>
                <small>承运收入</small>
                <strong>{money(order.carrier_total_cents)}</strong>
              </div>
              <div>
                <small>运输车辆</small>
                <strong>{order.vehicle_count} 台</strong>
              </div>
              <div>
                <small>计划装货</small>
                <strong>{order.planned_loading_date}</strong>
              </div>
              <div>
                <small>货物</small>
                <strong>{order.cargo_name}</strong>
              </div>
            </div>
            {order.status === "CARRIER_CONFIRM_PENDING" && (
              <button
                className="primary"
                onClick={async () => {
                  await api(`/carrier/orders/${order.id}/confirm`, "POST", {});
                  refresh();
                }}
              >
                <CheckCircle2 size={16} />
                确认承运
              </button>
            )}
            <div className="detail-grid">
              <div>
                <h3>装货</h3>
                <p>{order.loading_address}</p>
                <p>
                  {order.loading_contact} · {order.loading_phone}
                </p>
              </div>
              <div>
                <h3>卸货</h3>
                <p>{order.unloading_address}</p>
                <p>
                  {order.unloading_contact} · {order.unloading_phone}
                </p>
              </div>
            </div>
            <h3>运输任务</h3>
            <GridTable
              headers={["任务编号", "车辆 / 司机", "绑定截止", "状态", "操作"]}
              rows={(data.tasks ?? []).map((task: Row) => [
                <strong>{task.task_no}</strong>,
                task.plate_number ? (
                  <>
                    {task.plate_number}
                    <small>{task.driver_name}</small>
                  </>
                ) : (
                  "待绑定"
                ),
                task.assignment_due_at?.slice(0, 10),
                <Badge value={task.status} />,
                <div className="actions">
                  {[
                    "VEHICLE_ASSIGN_PENDING",
                    "VEHICLE_REVIEW_PENDING",
                    "READY_FOR_LOADING",
                  ].includes(task.status) && (
                    <button
                      onClick={() =>
                        navigate(`/carrier/tasks/${task.id}/vehicle`)
                      }
                    >
                      {task.vehicle_id ? "更换车辆" : "绑定车辆"}
                    </button>
                  )}
                  {["READY_FOR_LOADING", "LOADED", "IN_TRANSIT"].includes(
                    task.status,
                  ) && (
                    <button
                      className="text-button"
                      onClick={() =>
                        navigate(`/carrier/tasks/${task.id}/events`)
                      }
                    >
                      运输节点
                    </button>
                  )}
                </div>,
              ])}
            />
          </section>
        </>
      );
    }
    const items = data.items ?? [];
    return (
      <>
        <div className="dashboard-summary">
          <div>
            <small>待车队确认</small>
            <strong>
              {
                items.filter((x: Row) => x.status === "CARRIER_CONFIRM_PENDING")
                  .length
              }
            </strong>
          </div>
          <div>
            <small>待绑定 / 审核</small>
            <strong>
              {
                items.filter((x: Row) =>
                  ["VEHICLE_ASSIGN_PENDING", "VEHICLE_REVIEW_PENDING"].includes(
                    x.status,
                  ),
                ).length
              }
            </strong>
          </div>
          <div>
            <small>运输中</small>
            <strong>
              {items.filter((x: Row) => x.status === "IN_TRANSIT").length}
            </strong>
          </div>
        </div>
        <GridTable
          headers={["订单", "线路", "装货日期", "车辆", "承运收入", "状态", ""]}
          rows={items.map((x: Row) => [
            <strong>{x.order_no}</strong>,
            x.route_snapshot,
            x.planned_loading_date,
            `${x.vehicle_count} 台`,
            money(x.carrier_total_cents),
            <Badge value={x.status} />,
            <button
              className="text-button"
              onClick={() => navigate(`/carrier/orders/${x.id}`)}
            >
              处理 <ArrowRight size={14} />
            </button>,
          ])}
        />
      </>
    );
  }

  if (path === "/admin/vehicles")
    return (
      <>
        <p className="muted">车辆资质审核通过后，车队才能完成任务车辆审核。</p>
        <GridTable
          headers={["车队", "车牌", "车型", "国家", "状态", "操作"]}
          rows={(data.items ?? []).map((x: Row) => [
            x.company_name,
            <strong>{x.plate_number}</strong>,
            x.vehicle_type,
            x.country_name,
            <Badge value={x.status} />,
            x.status === "PENDING_REVIEW" &&
            ["SUPER_ADMIN", "REVIEWER"].includes(role) ? (
              <button
                onClick={() =>
                  setDialog(
                    <Dialog title="车辆资质审核" close={close}>
                      <ActionForm
                        submit="确认审核"
                        action={async (f) => {
                          await api(`/admin/vehicles/${x.id}/review`, "POST", {
                            decision: f.get("decision"),
                            reason: f.get("reason"),
                          });
                          complete();
                        }}
                      >
                        <label>
                          审核结果
                          <select name="decision" required>
                            <option value="APPROVE">通过</option>
                            <option value="REJECT">拒绝</option>
                          </select>
                        </label>
                        <label>
                          审核说明
                          <input name="reason" />
                        </label>
                      </ActionForm>
                    </Dialog>,
                  )
                }
              >
                审核
              </button>
            ) : (
              "—"
            ),
          ])}
        />
        {dialog}
      </>
    );
  if (data.task) {
    const task = data.task;
    return (
      <>
        <button
          className="text-button"
          onClick={() => navigate("/admin/tasks")}
        >
          ← 返回任务列表
        </button>
        <section className="panel">
          <div className="section-head">
            <div>
              <p className="eyebrow">{task.order_no}</p>
              <h2>{task.task_no}</h2>
            </div>
            <Badge value={task.status} />
          </div>
          <div className="detail-grid">
            <div>
              <h3>车辆与司机</h3>
              <p>{task.plate_number || "尚未绑定"}</p>
              <p>
                {task.driver_name
                  ? `${task.driver_name} · ${task.driver_phone}`
                  : "—"}
              </p>
            </div>
            <div>
              <h3>装卸地址</h3>
              <p>{task.loading_address}</p>
              <p>{task.unloading_address}</p>
            </div>
          </div>
          {task.status === "VEHICLE_REVIEW_PENDING" &&
            ["SUPER_ADMIN", "REVIEWER"].includes(role) && (
              <ActionForm
                submit="提交审核"
                action={async (f) => {
                  await api(
                    `/admin/tasks/${task.id}/assignment-review`,
                    "POST",
                    { decision: f.get("decision"), reason: f.get("reason") },
                  );
                  refresh();
                }}
              >
                <label>
                  审核结果
                  <select name="decision">
                    <option value="APPROVE">通过车辆绑定</option>
                    <option value="REJECT">退回重绑</option>
                  </select>
                </label>
                <label>
                  审核说明
                  <input name="reason" />
                </label>
              </ActionForm>
            )}
          <h3>运输记录</h3>
          <div className="timeline">
            {(data.events ?? []).map((event: Row) => (
              <div className="timeline-item" key={event.id}>
                <span className="timeline-dot" />
                <div>
                  <strong>
                    {labels[event.event_type] ?? event.event_type}
                  </strong>
                  <small>
                    {new Date(event.event_time).toLocaleString("zh-CN")} ·{" "}
                    {event.location_text}
                  </small>
                </div>
              </div>
            ))}
          </div>
        </section>
      </>
    );
  }
  return (
    <GridTable
      headers={["订单 / 任务", "线路", "车辆 / 司机", "装货日", "状态", ""]}
      rows={(data.items ?? []).map((x: Row) => [
        <>
          <strong>{x.order_no}</strong>
          <small>{x.task_no}</small>
        </>,
        x.route_snapshot,
        x.plate_number ? (
          <>
            {x.plate_number}
            <small>{x.driver_name}</small>
          </>
        ) : (
          "待绑定"
        ),
        x.planned_loading_date,
        <Badge value={x.status} />,
        <button
          className="text-button"
          onClick={() => navigate(`/admin/tasks/${x.id}`)}
        >
          {x.status === "VEHICLE_REVIEW_PENDING" ? "审核" : "查看"}{" "}
          <ArrowRight size={14} />
        </button>,
      ])}
    />
  );
}
