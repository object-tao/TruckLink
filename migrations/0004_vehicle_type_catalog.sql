ALTER TABLE vehicle_types ADD COLUMN category TEXT;
-- statement
ALTER TABLE vehicle_types ADD COLUMN model_name TEXT;
-- statement
ALTER TABLE vehicle_types ADD COLUMN line_count INTEGER CHECK(line_count IS NULL OR line_count>0);
-- statement
ALTER TABLE vehicle_types ADD COLUMN axle_count INTEGER CHECK(axle_count IS NULL OR axle_count>0);
-- statement
ALTER TABLE vehicle_types ADD COLUMN effective_length_text TEXT;
-- statement
ALTER TABLE vehicle_types ADD COLUMN effective_volume_m3 INTEGER CHECK(effective_volume_m3 IS NULL OR effective_volume_m3>0);
-- statement
ALTER TABLE vehicle_types ADD COLUMN dimension_limits_complete INTEGER NOT NULL DEFAULT 1 CHECK(dimension_limits_complete IN (0,1));
-- statement
INSERT INTO vehicle_types(id,code,name,category,model_name,line_count,axle_count,effective_length_text,effective_volume_m3,max_weight_kg,max_length_cm,max_width_cm,max_height_cm,dimension_limits_complete) VALUES
('tarpaulin-corridor-5x5-90','TP-COR-5-90','蓬布车 · 大通道 · 5线5轴 · 90方','蓬布车','大通道',5,5,'13.5',90,22000,1350,10000,10000,0),
('tarpaulin-corridor-5x5-93','TP-COR-5-93','蓬布车 · 大通道 · 5线5轴 · 93方','蓬布车','大通道',5,5,'13.5',93,22000,1350,10000,10000,0),
('tarpaulin-corridor-5x5-100','TP-COR-5-100','蓬布车 · 大通道 · 5线5轴 · 100方','蓬布车','大通道',5,5,'13.5',100,22000,1350,10000,10000,0),
('tarpaulin-corridor-6x6-90','TP-COR-6-90','蓬布车 · 大通道 · 6线6轴 · 90方','蓬布车','大通道',6,6,'13.5',90,27000,1350,10000,10000,0),
('tarpaulin-corridor-6x6-93','TP-COR-6-93','蓬布车 · 大通道 · 6线6轴 · 93方','蓬布车','大通道',6,6,'13.5',93,27000,1350,10000,10000,0),
('tarpaulin-corridor-6x6-100','TP-COR-6-100','蓬布车 · 大通道 · 6线6轴 · 100方','蓬布车','大通道',6,6,'13.5',100,27000,1350,10000,10000,0),
('tarpaulin-stepdeck-7x7-120','TP-STEP-7-120','蓬布车 · 高低板篷布 · 7线7轴 · 120方','蓬布车','高低板篷布',7,7,'17',120,34000,1700,10000,10000,0),
('tarpaulin-stepdeck-8x8-120','TP-STEP-8-120','蓬布车 · 高低板篷布 · 8线8轴 · 120方','蓬布车','高低板篷布',8,8,'17',120,40000,1700,10000,10000,0),
('tarpaulin-sectional-5x5-17-160','TP-SEC-5-17','蓬布车 · 二节子 · 5线5轴 · 17米 · 160方','蓬布车','二节子',5,5,'17',160,22000,1700,10000,10000,0),
('tarpaulin-sectional-5x5-15-160','TP-SEC-5-15','蓬布车 · 二节子 · 5线5轴 · 15米 · 160方','蓬布车','二节子',5,5,'15',160,22000,1500,10000,10000,0),
('tarpaulin-sectional-6x6-17-160','TP-SEC-6-17','蓬布车 · 二节子 · 6线6轴 · 17米 · 160方','蓬布车','二节子',6,6,'17',160,28000,1700,10000,10000,0),
('tarpaulin-sectional-6x6-15-160','TP-SEC-6-15','蓬布车 · 二节子 · 6线6轴 · 15米 · 160方','蓬布车','二节子',6,6,'15',160,28000,1500,10000,10000,0),
('reefer-5x5-135-200','REEFER-5-135','冷藏车 · 5线5轴 · 13.5米 · 200方','冷藏车','冷藏车',5,5,'13.5',200,21500,1350,10000,10000,0),
('flatbed-136-5x5-200','FLAT-136-5','普通平板车 · 13.6米 · 5线5轴 · 200方','普通平板车','13.6米',5,5,'13.6',200,22000,1360,10000,10000,0),
('flatbed-136-6x6-200','FLAT-136-6','普通平板车 · 13.6米 · 6线6轴 · 200方','普通平板车','13.6米',6,6,'13.6',200,28000,1360,10000,10000,0),
('flatbed-136-7x7-200','FLAT-136-7','普通平板车 · 13.6米 · 7线7轴 · 200方','普通平板车','13.6米',7,7,'13.6',200,34000,1360,10000,10000,0),
('flatbed-17-5x5-200','FLAT-17-5','普通平板车 · 17米 · 5线5轴 · 200方','普通平板车','17米',5,5,'16.5',200,22000,1650,10000,10000,0),
('flatbed-17-6x6-200','FLAT-17-6','普通平板车 · 17米 · 6线6轴 · 200方','普通平板车','17米',6,6,'16.5',200,28000,1650,10000,10000,0),
('flatbed-17-7x7-200','FLAT-17-7','普通平板车 · 17米 · 7线7轴 · 200方','普通平板车','17米',7,7,'16.5',200,34000,1650,10000,10000,0),
('flatbed-17-8x8-200','FLAT-17-8','普通平板车 · 17米 · 8线8轴 · 200方','普通平板车','17米',8,8,'16.5',200,37000,1650,10000,10000,0),
('oversize-standard-special','OS-STANDARD','超限车 · 普通特种板','超限车','普通特种板',1,1,'13.6',200,100000,1360,10000,10000,0),
('oversize-extendable','OS-EXTEND','超限车 · 抽拉板','超限车','抽拉板',1,1,'13.6-28',200,100000,2800,10000,10000,0),
('oversize-ultralow','OS-ULTRALOW','超限车 · 超低板','超限车','超低板',1,2,'8+6',200,100000,1400,10000,10000,0),
('oversize-tower','OS-TOWER','超限车 · 塔筒板','超限车','塔筒板',1,1,'13.6-28',200,100000,2800,10000,10000,0),
('oversize-blade','OS-BLADE','超限车 · 叶片板','超限车','叶片板',1,1,'13.6-70',200,100000,7000,10000,10000,0),
('oversize-axle-line','OS-AXLE','超限车 · 轴线车','超限车','轴线车',1,2,'13.6',200,100000,1360,10000,10000,0),
('oversize-spliced','OS-SPLICED','超限车 · 拼接板','超限车','拼接板',1,2,'无标准',200,100000,10000,10000,10000,0);
