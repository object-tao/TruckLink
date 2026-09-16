# M1 REST API

请求前缀 `/api`，JSON body，写操作需要 `Content-Type: application/json`、`X-Requested-With: TruckLink` 和同源 Origin。认证使用 HttpOnly Session Cookie。成功返回 JSON；错误格式 `{ "error": "说明" }`，状态码 400/401/403/404/409/429/500。

| 方法       | 路径                       | 说明                                                                  |
| ---------- | -------------------------- | --------------------------------------------------------------------- |
| POST       | /auth/register             | 仅 CUSTOMER/CARRIER：email、password（12–128 位）、display_name、role |
| POST       | /auth/login                | email、password；设置 Session                                         |
| GET        | /auth/me                   | 当前用户安全字段                                                      |
| POST       | /auth/logout               | 注销当前 Session                                                      |
| POST       | /auth/password             | current_password、new_password；失效全部会话                          |
| GET        | /master-data               | 国家/城市/车型/线路；非平台隐藏服务费                                 |
| GET / POST | /company                   | 客户企业建档/查询                                                     |
| GET        | /carrier/profile           | 自己的车队档案                                                        |
| POST       | /carrier/onboarding        | company_name、country_id、contact_name、phone                         |
| GET / POST | /carrier/capacity          | 自己运力列表/提交审核                                                 |
| GET        | /capacity                  | 匿名可售市场；过滤 route_id、vehicle_type_id、loading_date            |
| GET        | /capacity/:id              | 匿名运力详情                                                          |
| POST       | /orders                    | 创建订单，需 Idempotency-Key                                          |
| GET        | /orders                    | 自己企业最近 100 条订单                                               |
| GET        | /orders/:id                | 自己企业订单与任务，不存在或不属于自己均返回 404                      |
| GET        | /admin/carriers            | 车队列表                                                              |
| POST       | /admin/carriers/:id/review | SUPER_ADMIN/REVIEWER 审核                                             |
| GET        | /admin/capacity            | 运力列表（含成本）                                                    |
| POST       | /admin/capacity/:id/review | SUPER_ADMIN/REVIEWER 审核                                             |
| GET        | /admin/orders              | SUPER_ADMIN/OPERATIONS/FINANCE 订单列表                               |
| GET        | /admin/orders/:id          | 订单、价格快照与任务                                                  |
| GET        | /admin/customers           | 客户列表                                                              |
| POST / PUT | /admin/routes[/:id]        | SUPER_ADMIN/OPERATIONS 创建/修改线路                                  |
| POST / PUT | /admin/vehicle-types[/:id] | SUPER_ADMIN/OPERATIONS 创建/修改车型                                  |
| GET / POST | /admin/users               | SUPER_ADMIN 查看成员/创建 OPERATIONS、REVIEWER、FINANCE               |
| GET        | /admin/audit-logs          | SUPER_ADMIN 最近 100 条审计                                           |

审核 body：`{ "decision": "APPROVE" | "REJECT", "reason": "拒绝时必填" }`。仅 PENDING/PENDING_REVIEW 可处理，重复审核返回 409。

运力 body：route_id、vehicle_type_id、loading_date、carrier_price_cents、total_capacity（1–100）、transit_days_min/max、valid_until（UTC ISO）。必须来自已审核 ACTIVE 车队。

订单 body：capacity_offer_id、vehicle_count（1–100）、cargo_name、cargo_weight_kg、cargo_quantity、cargo_length_cm、cargo_width_cm、cargo_height_cm、cargo_remark、loading_address/contact/phone、unloading_address/contact/phone。货物数据按每台车填写。禁止传入价格、企业 ID 或状态。

订单响应包含 `{ order, replayed }`；首次 201，幂等重放 200。`Idempotency-Key` 为 8–100 位字母/数字/下划线/连字符；同一用户同键不同载荷 409。页面在一次下单尝试期间保持相同 UUID，不因网络重试更换。

金额示例：18,000 元车队价 = 1,800,000 分，服务费 80,000 分，客户单价 1,880,000 分。2 台总额 3,760,000 分，30% 首款 1,128,000 分，尾款 2,632,000 分。

健康检查 `/health` 不需要登录，会实际查询 D1，并返回 service、status、milestone、commit。
