PRAGMA foreign_keys = ON;
-- statement
CREATE TABLE countries (id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL);
-- statement
CREATE TABLE cities (id TEXT PRIMARY KEY, country_id TEXT NOT NULL REFERENCES countries(id), name TEXT NOT NULL, UNIQUE(country_id,name), UNIQUE(id,country_id));
-- statement
CREATE TABLE customer_companies (
 id TEXT PRIMARY KEY, company_name TEXT NOT NULL, contact_name TEXT NOT NULL, phone TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','DISABLED')),
 created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
-- statement
CREATE TABLE carriers (
 id TEXT PRIMARY KEY, company_name TEXT NOT NULL, country_id TEXT NOT NULL REFERENCES countries(id), contact_name TEXT NOT NULL, phone TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','ACTIVE','SUSPENDED','REJECTED')),
 credit_score INTEGER NOT NULL DEFAULT 60 CHECK(credit_score BETWEEN 0 AND 100), credit_level TEXT NOT NULL DEFAULT 'B' CHECK(credit_level IN ('S','A','B','C')),
 settlement_term TEXT NOT NULL DEFAULT 'T+7',
 created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
-- statement
CREATE TABLE users (
 id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE, display_name TEXT NOT NULL, password_hash TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('CUSTOMER','CARRIER','SUPER_ADMIN','OPERATIONS','REVIEWER','FINANCE')),
 customer_company_id TEXT REFERENCES customer_companies(id), carrier_id TEXT REFERENCES carriers(id),
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
 created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 CHECK((role='CUSTOMER' AND carrier_id IS NULL) OR (role='CARRIER' AND customer_company_id IS NULL) OR (role IN ('SUPER_ADMIN','OPERATIONS','REVIEWER','FINANCE') AND customer_company_id IS NULL AND carrier_id IS NULL))
);
-- statement
CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')));
-- statement
CREATE INDEX sessions_user ON sessions(user_id);
-- statement
CREATE TABLE auth_limits (key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, expires_at INTEGER NOT NULL);
-- statement
CREATE TABLE vehicle_types (
 id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
 max_weight_kg INTEGER NOT NULL CHECK(max_weight_kg>0), max_length_cm INTEGER NOT NULL CHECK(max_length_cm>0), max_width_cm INTEGER NOT NULL CHECK(max_width_cm>0), max_height_cm INTEGER NOT NULL CHECK(max_height_cm>0),
 status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','DISABLED')),
 created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
-- statement
CREATE TABLE routes (
 id TEXT PRIMARY KEY, route_code TEXT NOT NULL UNIQUE,
 origin_country_id TEXT NOT NULL REFERENCES countries(id), origin_city_id TEXT NOT NULL,
 destination_country_id TEXT NOT NULL REFERENCES countries(id), destination_city_id TEXT NOT NULL,
 deposit_rate_bps INTEGER NOT NULL CHECK(deposit_rate_bps BETWEEN 0 AND 10000), service_fee_cents INTEGER NOT NULL CHECK(service_fee_cents BETWEEN 0 AND 100000000),
 status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','PAUSED','DISABLED')),
 created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 FOREIGN KEY(origin_city_id,origin_country_id) REFERENCES cities(id,country_id), FOREIGN KEY(destination_city_id,destination_country_id) REFERENCES cities(id,country_id),
 CHECK(origin_city_id<>destination_city_id), UNIQUE(origin_city_id,destination_city_id)
);
-- statement
CREATE TABLE capacity_offers (
 id TEXT PRIMARY KEY, offer_no TEXT NOT NULL UNIQUE, carrier_id TEXT NOT NULL REFERENCES carriers(id), route_id TEXT NOT NULL REFERENCES routes(id), vehicle_type_id TEXT NOT NULL REFERENCES vehicle_types(id),
 loading_date TEXT NOT NULL, carrier_price_cents INTEGER NOT NULL CHECK(carrier_price_cents BETWEEN 1 AND 100000000),
 total_capacity INTEGER NOT NULL CHECK(total_capacity BETWEEN 1 AND 100), remaining_capacity INTEGER NOT NULL CHECK(remaining_capacity>=0 AND remaining_capacity<=total_capacity),
 transit_days_min INTEGER NOT NULL CHECK(transit_days_min BETWEEN 1 AND 365), transit_days_max INTEGER NOT NULL CHECK(transit_days_max>=transit_days_min AND transit_days_max<=365), valid_until TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('DRAFT','PENDING_REVIEW','APPROVED','AVAILABLE','REJECTED','SOLD_OUT','EXPIRED','DISABLED')),
 created_by TEXT NOT NULL REFERENCES users(id), approved_by TEXT REFERENCES users(id), approved_at TEXT, review_reason TEXT,
 created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
-- statement
CREATE INDEX capacity_search ON capacity_offers(status,route_id,vehicle_type_id,loading_date,valid_until);
-- statement
CREATE INDEX capacity_carrier ON capacity_offers(carrier_id,created_at);
-- statement
CREATE TABLE orders (
 id TEXT PRIMARY KEY, order_no TEXT NOT NULL UNIQUE, customer_company_id TEXT NOT NULL REFERENCES customer_companies(id), customer_user_id TEXT NOT NULL REFERENCES users(id),
 capacity_offer_id TEXT NOT NULL REFERENCES capacity_offers(id), carrier_id TEXT NOT NULL REFERENCES carriers(id), route_id TEXT NOT NULL REFERENCES routes(id), vehicle_type_id TEXT NOT NULL REFERENCES vehicle_types(id),
 vehicle_count INTEGER NOT NULL CHECK(vehicle_count BETWEEN 1 AND 100),
 carrier_unit_price_snapshot INTEGER NOT NULL CHECK(carrier_unit_price_snapshot>0), service_fee_snapshot INTEGER NOT NULL CHECK(service_fee_snapshot>=0), customer_unit_price_snapshot INTEGER NOT NULL,
 deposit_rate_snapshot INTEGER NOT NULL CHECK(deposit_rate_snapshot BETWEEN 0 AND 10000), total_amount_cents INTEGER NOT NULL, deposit_amount_cents INTEGER NOT NULL, balance_amount_cents INTEGER NOT NULL,
 route_snapshot TEXT NOT NULL, vehicle_type_snapshot TEXT NOT NULL, currency TEXT NOT NULL DEFAULT 'CNY' CHECK(currency='CNY'),
 cargo_name TEXT NOT NULL, cargo_weight_kg INTEGER NOT NULL CHECK(cargo_weight_kg>0), cargo_quantity INTEGER NOT NULL CHECK(cargo_quantity>0), cargo_length_cm INTEGER NOT NULL CHECK(cargo_length_cm>0), cargo_width_cm INTEGER NOT NULL CHECK(cargo_width_cm>0), cargo_height_cm INTEGER NOT NULL CHECK(cargo_height_cm>0), cargo_remark TEXT NOT NULL DEFAULT '',
 loading_address TEXT NOT NULL, loading_contact TEXT NOT NULL, loading_phone TEXT NOT NULL, unloading_address TEXT NOT NULL, unloading_contact TEXT NOT NULL, unloading_phone TEXT NOT NULL, planned_loading_date TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('PAYMENT_PENDING','ORDERED','CARRIER_CONFIRM_PENDING','VEHICLE_ASSIGN_PENDING','VEHICLE_REVIEW_PENDING','READY_FOR_LOADING','LOADED','IN_TRANSIT','BALANCE_PENDING','ARRIVED','UNLOADING','COMPLETED','CANCELLED','EXCEPTION','DISPUTED')),
 idempotency_key TEXT NOT NULL, request_hash TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 UNIQUE(customer_user_id,idempotency_key),
 CHECK(customer_unit_price_snapshot=carrier_unit_price_snapshot+service_fee_snapshot), CHECK(total_amount_cents=customer_unit_price_snapshot*vehicle_count),
 CHECK(deposit_amount_cents=CAST((total_amount_cents*deposit_rate_snapshot+5000)/10000 AS INTEGER)), CHECK(balance_amount_cents=total_amount_cents-deposit_amount_cents)
);
-- statement
CREATE INDEX orders_customer ON orders(customer_company_id,created_at);
-- statement
CREATE INDEX orders_carrier ON orders(carrier_id,created_at);
-- statement
CREATE TABLE order_tasks (
 id TEXT PRIMARY KEY, task_no TEXT NOT NULL UNIQUE, order_id TEXT NOT NULL REFERENCES orders(id), sequence INTEGER NOT NULL CHECK(sequence>0),
 status TEXT NOT NULL DEFAULT 'AWAITING_DEPOSIT' CHECK(status IN ('AWAITING_DEPOSIT')),
 planned_loading_date TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')), UNIQUE(order_id,sequence)
);
-- statement
CREATE TABLE audit_logs (
 id TEXT PRIMARY KEY, operator_type TEXT NOT NULL, operator_id TEXT NOT NULL REFERENCES users(id), module TEXT NOT NULL, object_type TEXT NOT NULL, object_id TEXT NOT NULL, action TEXT NOT NULL,
 before_data TEXT, after_data TEXT, ip_address TEXT, created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
-- statement
CREATE INDEX audit_object ON audit_logs(object_type,object_id,created_at);
-- statement
CREATE TRIGGER order_reserve_capacity BEFORE INSERT ON orders BEGIN
 -- Parenthesize CASE so D1's remote splitter does not confuse CASE END with trigger END.
 SELECT (CASE WHEN NOT EXISTS (
  SELECT 1 FROM capacity_offers c JOIN routes r ON r.id=c.route_id JOIN vehicle_types v ON v.id=c.vehicle_type_id JOIN carriers ca ON ca.id=c.carrier_id JOIN customer_companies cc ON cc.id=NEW.customer_company_id JOIN users u ON u.id=NEW.customer_user_id
  WHERE c.id=NEW.capacity_offer_id AND c.status='AVAILABLE' AND c.remaining_capacity>=NEW.vehicle_count
  AND c.valid_until>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND c.loading_date>=date('now')
  AND ca.status='ACTIVE' AND cc.status='ACTIVE' AND u.active=1 AND u.role='CUSTOMER' AND u.customer_company_id=cc.id AND r.status='ACTIVE' AND v.status='ACTIVE'
  AND NEW.carrier_id=c.carrier_id AND NEW.route_id=r.id AND NEW.vehicle_type_id=v.id AND NEW.planned_loading_date=c.loading_date
  AND NEW.carrier_unit_price_snapshot=c.carrier_price_cents AND NEW.service_fee_snapshot=r.service_fee_cents AND NEW.deposit_rate_snapshot=r.deposit_rate_bps
  AND NEW.cargo_weight_kg<=v.max_weight_kg AND NEW.cargo_length_cm<=v.max_length_cm AND NEW.cargo_width_cm<=v.max_width_cm AND NEW.cargo_height_cm<=v.max_height_cm
 ) THEN RAISE(ABORT,'CAPACITY_UNAVAILABLE_OR_CHANGED') END);
 UPDATE capacity_offers SET remaining_capacity=remaining_capacity-NEW.vehicle_count,
  status=(CASE WHEN remaining_capacity=NEW.vehicle_count THEN 'SOLD_OUT' ELSE 'AVAILABLE' END),
  updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=NEW.capacity_offer_id;
END;
-- statement
CREATE TRIGGER order_snapshot_immutable BEFORE UPDATE OF carrier_unit_price_snapshot,service_fee_snapshot,customer_unit_price_snapshot,deposit_rate_snapshot,total_amount_cents,deposit_amount_cents,balance_amount_cents,vehicle_count,capacity_offer_id,carrier_id,route_id,vehicle_type_id,customer_company_id,customer_user_id,planned_loading_date,route_snapshot,vehicle_type_snapshot ON orders BEGIN
 SELECT RAISE(ABORT,'ORDER_SNAPSHOT_IMMUTABLE');
END;
