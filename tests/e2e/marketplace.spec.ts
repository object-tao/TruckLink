import { test, expect } from "@playwright/test";
const password = "TruckLink-Dev-2026!";
test("carrier publishes, reviewer approves, customer buys two trucks, admin verifies", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  async function login(role: string) {
    await page.context().clearCookies();
    await page.goto("/login");
    await page.getByLabel("邮箱", { exact: true }).fill(`${role}@example.test`);
    await page.getByLabel("密码（至少 12 位）").fill(password);
    await page.getByRole("button", { name: "登录", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
  await login("carrier");
  await page
    .getByRole("button", { name: "发布运力", exact: true })
    .first()
    .click();
  await page.getByLabel("线路", { exact: true }).selectOption("horgos-almaty");
  await page.getByLabel("车型", { exact: true }).selectOption("box-136");
  await page
    .getByLabel("装货日期", { exact: true })
    .fill(new Date(Date.now() + 8 * 86400000).toISOString().slice(0, 10));
  await page.getByLabel("车队报价（元 / 台）").fill("18000");
  await page
    .getByLabel("报价有效期（本地时间）")
    .fill(new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 16));
  const created = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/carrier/capacity") &&
      r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "提交运力审核" }).click();
  const offer = await (await created).json();
  expect(offer.id).toBeTruthy();
  await login("reviewer");
  await page.goto("/admin/capacity");
  const row = page.getByRole("row").filter({ hasText: offer.offer_no });
  await row.getByRole("button", { name: "处理审核" }).click();
  await page.getByLabel("审核结果").selectOption("APPROVE");
  await page.getByRole("button", { name: "确认审核" }).click();
  await expect(row.getByText("可预订")).toBeVisible();
  await login("customer");
  await page.goto(`/capacity/${offer.id}`);
  await page.getByRole("button", { name: "预订运力" }).click();
  for (const [label, value] of Object.entries({
    预订台数: "2",
    货物名称: "机械配件",
    "每车重量（kg）": "12000",
    每车件数: "20",
    "每车货物长度（cm）": "1000",
    "每车货物宽度（cm）": "200",
    "每车货物高度（cm）": "220",
    装货地址: "霍尔果斯物流园",
    装货联系人: "客户 A",
    装货电话: "13800000001",
    卸货地址: "阿拉木图仓库",
    卸货联系人: "收货人",
    卸货电话: "77010000001",
  }))
    await page.getByLabel(label, { exact: true }).fill(value);
  await expect(page.locator(".checkout-summary")).toContainText("¥37,600.00", {
    timeout: 15000,
  });
  await page.getByRole("button", { name: "确认并创建订单" }).click();
  await expect(
    page.getByRole("heading", { name: "订单详情", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("¥11,280.00", { exact: true })).toBeVisible();
  await expect(page.getByText("¥26,320.00", { exact: true })).toBeVisible();
  await expect(page.getByRole("row")).toHaveCount(3);
  const orderPath = new URL(page.url()).pathname;
  await login("admin");
  await page.goto("/admin" + orderPath);
  await expect(
    page.getByText("成本 ¥18,000.00 + 服务费 ¥800.00 / 台"),
  ).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "test-results/admin-order.png",
    fullPage: true,
  });
  await login("carrier");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("heading", { name: "工作台" })).toBeVisible();
  await expect(
    page.getByText("待车队确认", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText("正在加载最新数据…")).toHaveCount(0);
  await page.screenshot({
    path: "test-results/carrier-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await login("customer");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.getByText("跨越边境，连接生意。")).toBeVisible();
  await page.screenshot({
    path: "test-results/customer-market.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("M2 carrier confirms, assigns an approved vehicle, reviewer approves and customer tracks", async ({
  page,
}) => {
  async function login(role: string) {
    await page.context().clearCookies();
    await page.goto("/login");
    await page.getByLabel("邮箱", { exact: true }).fill(`${role}@example.test`);
    await page.getByLabel("密码（至少 12 位）").fill(password);
    await page.getByRole("button", { name: "登录", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }

  await login("carrier");
  await page.goto("/carrier/orders/m2-demo-order");
  await page.getByRole("button", { name: "确认承运" }).click();
  await expect(
    page.getByText("待绑定车辆", { exact: true }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "绑定车辆" }).click();
  await page.getByLabel("车辆").selectOption("demo-vehicle");
  await page.getByLabel("司机").selectOption("demo-driver");
  await page.getByRole("button", { name: "提交车辆绑定" }).click();
  await expect(
    page.getByText("车辆待审核", { exact: true }).first(),
  ).toBeVisible();

  await login("reviewer");
  await page.goto("/admin/tasks/m2-demo-task");
  await expect(page.getByText("新A·TL001", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "提交审核" }).click();
  await expect(page.getByText("待装货", { exact: true }).first()).toBeVisible();

  await login("carrier");
  await page.goto("/carrier/tasks/m2-demo-task/events");
  await page.getByLabel("具体位置").fill("霍尔果斯装货区");
  await page.getByRole("button", { name: "记录运输节点" }).click();
  await expect(page.getByText("已装货", { exact: true }).first()).toBeVisible();

  await login("customer");
  await page.goto("/orders/m2-demo-order/tracking");
  await expect(page.getByRole("heading", { name: "运输轨迹" })).toBeVisible();
  await expect(page.getByText(/霍尔果斯装货区/)).toBeVisible();
  await expect(page.getByText("新A·TL001")).toHaveCount(0);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "test-results/customer-tracking.png",
    fullPage: true,
  });
});

test("admin can view the imported 27-row vehicle catalog", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("邮箱", { exact: true }).fill("admin@example.test");
  await page.getByLabel("密码（至少 12 位）").fill(password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.goto("/admin/master-data/vehicle-types");
  await expect(page.getByText("TP-COR-5-90", { exact: true })).toBeVisible({
    timeout: 15000,
  });
  await expect(page.getByText("OS-SPLICED", { exact: true })).toBeVisible({
    timeout: 15000,
  });
  await expect(page.getByText("13.6-70 米", { exact: true })).toBeVisible({
    timeout: 15000,
  });
  await expect(
    page.getByRole("button", { name: "删除", exact: true }).first(),
  ).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "test-results/admin-vehicle-catalog.png",
    fullPage: true,
  });
});
