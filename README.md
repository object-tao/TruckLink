# TruckLink · Milestone 2

跨境整车运力平台。M1 已实现车队发布 → 平台审核 → 客户搜索 → 原子下单；M2 新增车队确认、车辆/司机档案、任务派车与平台审核、运输节点和客户脱敏轨迹。付款仍属于 M3，正常新订单会停留在 `PAYMENT_PENDING`，本地 seed 另含一笔已进入履约阶段的演示订单。

线上：https://trucklink.obiecrm-ab8ac7.workers.dev

## 技术架构

React + TypeScript + Vite 三端 Web；Hono REST API + Zod；Cloudflare Workers + D1。采用 D1 而不是文档建议的 PostgreSQL，是为了沿用已建立的 Cloudflare 部署，并在 M1 使用事务批处理与数据库触发器保证库存安全。详情见 [架构与 ERD](docs/architecture.md)、[API 清单](docs/api.md)。

金额均为整数分；首款比例为万分比。`cargo_*` 重量、尺寸与件数按每台车申报，订单内每台车采用相同申报值。时间戳统一为 UTC ISO-8601，装货日是业务日历日期 `YYYY-MM-DD`；报价有效期前端按本地时间填写，转换成 UTC 保存。

车型目录包含原有兼容车型及 27 条业务车型规格。业务规格保留分类、车型名称、线数、轴数、有效长度原文、有效方数和载重；区间长度按上限生成下单长度约束，“8+6”按合计 14 米记录，“无标准”不展示固定长度上限。源表未提供宽高，因此这些导入规格不会在页面声明具体宽高限制。

## 本地运行（Node 24）

```sh
npm ci
npm run db:migrate
npm run seed
npm run build
npm run dev
```

访问 `http://localhost:8787`。开发前端时可另开 `npx vite`（代理 API 至 8787）。源码和依赖保存在 `D:\CodexSessionArchive\TruckLink\repo`。

开发账号（仅本地）：`admin@example.test`、`customer@example.test`、`customer-b@example.test`、`carrier@example.test`、`reviewer@example.test`、`operations@example.test`、`finance@example.test`。统一开发密码：`TruckLink-Dev-2026!`。

本地 seed 创建 6 国、7 城市、3 车型、3 线路及 Carrier A / Customer A，含 M1 待审核运力和 M2 待车队确认演示订单 `TL-M2-DEMO`、已审核车辆、司机。重复 seed 不覆盖现有记录，不重置已销售库存。生产迁移仅写基础国家/城市/车型/线路；绝不执行 demo seed。

## 验证

```sh
npm run check
npm test
npm run build
npm run db:migrate
npm run seed
npx playwright install chromium
npm run test:e2e
```

Windows 可设置 `PLAYWRIGHT_CHROME_PATH` 使用已有 Chrome。浏览器测试仅操作本地测试数据库，并在 `test-results/` 输出桌面/手机截图。每次测试创建独立运力，不依赖之前测试的订单。

集成测试使用真实 Miniflare D1 数据库，覆盖需求第 59 节的金额/库存/两任务案例、并发和事务回滚，以及 M2 的租户隔离、车队确认、多任务聚合、换车重审、运输节点顺序/幂等、客户轨迹脱敏和审计。测试运行器固定 Miniflare 4（兼容日 2026-08-06）；生产和浏览器测试使用 Wrangler 4 当前运行时。

## 生产发布与账号

PR 执行类型检查、集成测试、构建、全新本地数据库迁移、seed 和浏览器闭环测试。`main` 检查成功后按顺序执行生产 D1 migration → 构建/部署 Worker 和静态资源 → 校验线上健康接口及 Git commit。仅 production environment 可访问 Cloudflare secrets。

首个管理员使用 `scripts/bootstrap-admin.ts`，从环境读取 `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`、`TRUCKLINK_ADMIN_EMAIL`、`TRUCKLINK_ADMIN_PASSWORD`（至少 16 位）。执行 `npx tsx scripts/bootstrap-admin.ts`，仅在没有超级管理员时插入，不覆盖已有账号。账号凭据不可提交到 Git。管理员登录后可在账户设置修改密码、在平台成员页创建运营/审核/财务账号。公开注册不能创建平台角色。

Session 随机令牌只以 SHA-256 摘要存库，Cookie 为 HttpOnly / SameSite=Lax / HTTPS Secure，有效期 12 小时；密码使用随机盐 PBKDF2-SHA256（100,000 次，兼容 Workers WebCrypto）。登录和注册有数据库计数限速；写 API 要求同源及自定义请求头。改密使该用户所有 Session 失效。

客户查询只返回匿名运力与客户价；车队只读取自身运力成本报价。订单归属通过服务端企业 ID 判断，平台订单详情按角色授权。审核、创建、改价和登录等操作写入审计日志。

回滚代码：revert 对应提交并合并 main，自动重新部署。数据库迁移为前向迁移，不自动 down；回滚应用前需确认 schema 兼容。生产健康检查失败会使流水线失败，不会自动回滚。

## 页面

- 公共登录/注册：`/login`（`/carrier/login`、`/admin/login` 同样进入登录）
- 客户：`/home`、`/capacity/:id`、`/company/setup`、`/order/create?offer=:id`、`/orders`、`/orders/:id`、`/orders/:id/tracking`、`/profile`
- 车队 H5：`/carrier/home`、`/carrier/orders`、`/carrier/orders/:id`、`/carrier/tasks/:id/vehicle`、`/carrier/tasks/:id/events`、`/carrier/vehicles`、`/carrier/drivers`、`/carrier/capacity`、`/carrier/capacity/create`
- 后台：`/admin/dashboard`、`/admin/orders`、`/admin/tasks`、`/admin/tasks/:id`、`/admin/vehicles`、`/admin/capacity`、`/admin/carriers`、`/admin/routes`、`/admin/master-data/vehicle-types`、`/admin/users`、`/admin/audit-logs`

## 边界与后续

M2 不包含付款凭证/确认到账、取消退款、自动释放未支付库存、结算、附加费、罚款、发票、资质附件上传或微信原生小程序。当前未支付订单占用库存，不自动过期释放。列表按最近 100 条返回；规模扩大时增加游标分页。

下一阶段为 M3 Payments：首款、银行转账凭证、财务确认、尾款和应收。M2 没有新增绕过付款的公开端点。
