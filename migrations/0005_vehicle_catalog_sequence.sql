ALTER TABLE vehicle_types ADD COLUMN catalog_sequence INTEGER CHECK(catalog_sequence IS NULL OR catalog_sequence>0);
-- statement
UPDATE vehicle_types SET catalog_sequence=CASE id
 WHEN 'tarpaulin-corridor-5x5-90' THEN 1
 WHEN 'tarpaulin-corridor-5x5-93' THEN 2
 WHEN 'tarpaulin-corridor-5x5-100' THEN 3
 WHEN 'tarpaulin-corridor-6x6-90' THEN 4
 WHEN 'tarpaulin-corridor-6x6-93' THEN 5
 WHEN 'tarpaulin-corridor-6x6-100' THEN 6
 WHEN 'tarpaulin-stepdeck-7x7-120' THEN 7
 WHEN 'tarpaulin-stepdeck-8x8-120' THEN 8
 WHEN 'tarpaulin-sectional-5x5-17-160' THEN 9
 WHEN 'tarpaulin-sectional-5x5-15-160' THEN 10
 WHEN 'tarpaulin-sectional-6x6-17-160' THEN 11
 WHEN 'tarpaulin-sectional-6x6-15-160' THEN 12
 WHEN 'reefer-5x5-135-200' THEN 13
 WHEN 'flatbed-136-5x5-200' THEN 14
 WHEN 'flatbed-136-6x6-200' THEN 15
 WHEN 'flatbed-136-7x7-200' THEN 16
 WHEN 'flatbed-17-5x5-200' THEN 17
 WHEN 'flatbed-17-6x6-200' THEN 18
 WHEN 'flatbed-17-7x7-200' THEN 19
 WHEN 'flatbed-17-8x8-200' THEN 20
 WHEN 'oversize-standard-special' THEN 21
 WHEN 'oversize-extendable' THEN 22
 WHEN 'oversize-ultralow' THEN 23
 WHEN 'oversize-tower' THEN 24
 WHEN 'oversize-blade' THEN 25
 WHEN 'oversize-axle-line' THEN 26
 WHEN 'oversize-spliced' THEN 27
 END WHERE category IS NOT NULL;
