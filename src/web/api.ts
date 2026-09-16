export async function api(
  path: string,
  method = "GET",
  data?: unknown,
  key?: string,
) {
  const response = await fetch(`/api${path}`, {
    method,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "TruckLink",
      ...(key ? { "Idempotency-Key": key } : {}),
    },
    ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
  });
  const body = (await response.json()) as Record<string, any>;
  if (!response.ok) throw new Error(body.error ?? "请求失败");
  return body;
}
export const money = (cents: number) =>
  new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    maximumFractionDigits: 2,
  }).format(cents / 100);
export const labels: Record<string, string> = {
  PENDING: "待审核",
  PENDING_REVIEW: "待审核",
  ACTIVE: "正常",
  AVAILABLE: "可预订",
  REJECTED: "已拒绝",
  SOLD_OUT: "已售罄",
  EXPIRED: "已过期",
  DISABLED: "已停用",
  PAUSED: "已暂停",
  PAYMENT_PENDING: "待付首款",
  AWAITING_DEPOSIT: "等待首款",
  CUSTOMER: "客户",
  CARRIER: "车队",
  SUPER_ADMIN: "超级管理员",
  OPERATIONS: "运营",
  REVIEWER: "审核员",
  FINANCE: "财务",
};
