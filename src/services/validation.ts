import { z } from "zod";
const text = z.string().trim().min(1).max(200);
const phone = z.string().trim().min(5).max(30);
const money = z.number().int().min(0).max(100000000);
export const loginSchema = z.object({
  email: z
    .email()
    .max(200)
    .transform((x) => x.toLowerCase()),
  password: z.string().min(12).max(128),
});
export const registerSchema = loginSchema
  .extend({ display_name: text, role: z.enum(["CUSTOMER", "CARRIER"]) })
  .strict();
export const companySchema = z
  .object({ company_name: text, contact_name: text, phone })
  .strict();
export const carrierSchema = companySchema
  .extend({ country_id: text })
  .strict();
export const routeSchema = z
  .object({
    route_code: text,
    origin_country_id: text,
    origin_city_id: text,
    destination_country_id: text,
    destination_city_id: text,
    deposit_rate_bps: z.number().int().min(0).max(10000),
    service_fee_cents: money,
    status: z.enum(["ACTIVE", "PAUSED", "DISABLED"]).default("ACTIVE"),
  })
  .strict();
export const vehicleSchema = z
  .object({
    code: text,
    name: text,
    max_weight_kg: z.number().int().positive().max(1000000),
    max_length_cm: z.number().int().positive().max(10000),
    max_width_cm: z.number().int().positive().max(10000),
    max_height_cm: z.number().int().positive().max(10000),
    status: z.enum(["ACTIVE", "DISABLED"]).default("ACTIVE"),
  })
  .strict();
export const offerSchema = z
  .object({
    route_id: text,
    vehicle_type_id: text,
    loading_date: z.iso.date(),
    carrier_price_cents: money.min(1),
    total_capacity: z.number().int().min(1).max(100),
    transit_days_min: z.number().int().min(1).max(365),
    transit_days_max: z.number().int().min(1).max(365),
    valid_until: z.iso.datetime().transform((x) => new Date(x).toISOString()),
  })
  .strict()
  .refine(
    (x) => x.transit_days_max >= x.transit_days_min,
    "最长时效不能小于最短时效",
  )
  .refine(
    (x) => x.loading_date >= new Date().toISOString().slice(0, 10),
    "装货日期不能早于今天（UTC）",
  )
  .refine(
    (x) =>
      Date.parse(x.valid_until) > Date.now() &&
      x.valid_until.slice(0, 10) <= x.loading_date,
    "有效期必须晚于当前时间且不晚于装货日",
  );
export const reviewSchema = z
  .object({
    decision: z.enum(["APPROVE", "REJECT"]),
    reason: z.string().trim().max(500).default(""),
  })
  .strict()
  .refine(
    (x) => x.decision !== "REJECT" || x.reason.length > 0,
    "拒绝时请填写原因",
  );
export const orderSchema = z
  .object({
    capacity_offer_id: text,
    vehicle_count: z.number().int().min(1).max(100),
    cargo_name: text,
    cargo_weight_kg: z.number().int().positive().max(1000000),
    cargo_quantity: z.number().int().positive().max(1000000),
    cargo_length_cm: z.number().int().positive().max(10000),
    cargo_width_cm: z.number().int().positive().max(10000),
    cargo_height_cm: z.number().int().positive().max(10000),
    cargo_remark: z.string().trim().max(1000).default(""),
    loading_address: text,
    loading_contact: text,
    loading_phone: phone,
    unloading_address: text,
    unloading_contact: text,
    unloading_phone: phone,
  })
  .strict();

export const vehicleCreateSchema = z
  .object({
    plate_number: text,
    country_id: text,
    vehicle_type_id: text,
  })
  .strict();

export const driverCreateSchema = z
  .object({
    name: text,
    phone,
    id_number: z.string().trim().min(5).max(80),
  })
  .strict();

export const assignmentSchema = z
  .object({
    vehicle_id: text,
    driver_id: text,
  })
  .strict();

export const assignmentReviewSchema = z
  .object({
    decision: z.enum(["APPROVE", "REJECT"]),
    reason: z.string().trim().max(500).default(""),
  })
  .strict()
  .refine(
    (x) => x.decision !== "REJECT" || x.reason.length > 0,
    "拒绝时请填写原因",
  );

export const transportEventSchema = z
  .object({
    event_type: z.enum([
      "LOADED",
      "CUSTOMS_DECLARATION_STARTED",
      "CUSTOMS_CLEARED",
      "ENTERED_BORDER_ZONE",
      "WAITING_EXIT",
      "CHINA_EXITED",
      "FOREIGN_ENTERED",
      "TRANSIT_CUSTOMS",
      "IN_TRANSIT",
    ]),
    event_time: z.iso.datetime().transform((x) => new Date(x).toISOString()),
    country_id: text.nullish(),
    city_id: text.nullish(),
    location_text: text,
    remark: z.string().trim().max(1000).default(""),
  })
  .strict()
  .refine(
    (x) => Date.parse(x.event_time) <= Date.now() + 5 * 60 * 1000,
    "事件时间不能晚于当前时间",
  );
