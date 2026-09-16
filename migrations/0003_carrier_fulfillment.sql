CREATE TABLE vehicles (
 id TEXT PRIMARY KEY, carrier_id TEXT NOT NULL REFERENCES carriers(id), plate_number TEXT NOT NULL COLLATE NOCASE, country_id TEXT NOT NULL REFERENCES countries(id), vehicle_type_id TEXT NOT NULL REFERENCES vehicle_types(id),
 status TEXT NOT NULL DEFAULT 'PENDING_REVIEW' CHECK(status IN ('PENDING_REVIEW','ACTIVE','SUSPENDED','REJECTED')), review_reason TEXT,
 created_by TEXT NOT NULL REFERENCES users(id), reviewed_by TEXT REFERENCES users(id), reviewed_at TEXT,
 created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')), UNIQUE(carrier_id,plate_number)
);
-- statement
CREATE INDEX vehicles_review ON vehicles(status,created_at);
-- statement
CREATE TABLE drivers (
 id TEXT PRIMARY KEY, carrier_id TEXT NOT NULL REFERENCES carriers(id), name TEXT NOT NULL, phone TEXT NOT NULL, id_number TEXT NOT NULL COLLATE NOCASE,
 status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','DISABLED')), created_by TEXT NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')), UNIQUE(carrier_id,id_number)
);
-- statement
CREATE INDEX drivers_carrier ON drivers(carrier_id,status);
-- statement
ALTER TABLE orders ADD COLUMN carrier_confirmed_by TEXT REFERENCES users(id);
-- statement
ALTER TABLE orders ADD COLUMN carrier_confirmed_at TEXT;
-- statement
ALTER TABLE order_tasks RENAME TO order_tasks_m1;
-- statement
CREATE TABLE order_tasks (
 id TEXT PRIMARY KEY, task_no TEXT NOT NULL UNIQUE, order_id TEXT NOT NULL REFERENCES orders(id), sequence INTEGER NOT NULL CHECK(sequence>0),
 vehicle_id TEXT REFERENCES vehicles(id), driver_id TEXT REFERENCES drivers(id),
 status TEXT NOT NULL DEFAULT 'AWAITING_DEPOSIT' CHECK(status IN ('AWAITING_DEPOSIT','CARRIER_CONFIRM_PENDING','VEHICLE_ASSIGN_PENDING','VEHICLE_REVIEW_PENDING','READY_FOR_LOADING','LOADED','IN_TRANSIT')),
 assignment_version INTEGER NOT NULL DEFAULT 0 CHECK(assignment_version>=0), assigned_at TEXT, assignment_reviewed_by TEXT REFERENCES users(id), assignment_reviewed_at TEXT, assignment_review_reason TEXT,
 planned_loading_date TEXT NOT NULL, loaded_at TEXT, departed_at TEXT, arrived_at TEXT, unloaded_at TEXT,
 created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')), UNIQUE(order_id,sequence)
);
-- statement
INSERT INTO order_tasks(id,task_no,order_id,sequence,status,planned_loading_date,created_at,updated_at) SELECT id,task_no,order_id,sequence,status,planned_loading_date,created_at,updated_at FROM order_tasks_m1;
-- statement
DROP TABLE order_tasks_m1;
-- statement
CREATE INDEX tasks_order_status ON order_tasks(order_id,status);
-- statement
CREATE INDEX tasks_vehicle ON order_tasks(vehicle_id);
-- statement
CREATE TABLE transport_events (
 id TEXT PRIMARY KEY, order_task_id TEXT NOT NULL REFERENCES order_tasks(id), event_type TEXT NOT NULL CHECK(event_type IN ('LOADED','CUSTOMS_DECLARATION_STARTED','CUSTOMS_CLEARED','ENTERED_BORDER_ZONE','WAITING_EXIT','CHINA_EXITED','FOREIGN_ENTERED','TRANSIT_CUSTOMS','IN_TRANSIT')),
 event_time TEXT NOT NULL, country_id TEXT REFERENCES countries(id), city_id TEXT REFERENCES cities(id), location_text TEXT NOT NULL, remark TEXT NOT NULL DEFAULT '',
 operator_type TEXT NOT NULL, operator_id TEXT NOT NULL REFERENCES users(id), idempotency_key TEXT NOT NULL, request_hash TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')), UNIQUE(operator_id,idempotency_key)
);
-- statement
CREATE INDEX transport_events_task_time ON transport_events(order_task_id,event_time,created_at);
