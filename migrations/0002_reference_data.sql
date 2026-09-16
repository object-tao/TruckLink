INSERT INTO countries(id,code,name) VALUES ('cn','CN','中国'),('kz','KZ','哈萨克斯坦'),('uz','UZ','乌兹别克斯坦'),('tj','TJ','塔吉克斯坦'),('ru','RU','俄罗斯'),('de','DE','德国');
-- statement
INSERT INTO cities(id,country_id,name) VALUES ('horgos','cn','霍尔果斯'),('almaty','kz','阿拉木图'),('astana','kz','阿斯塔纳'),('tashkent','uz','塔什干'),('dushanbe','tj','杜尚别'),('moscow','ru','莫斯科'),('hamburg','de','汉堡');
-- statement
INSERT INTO vehicle_types(id,code,name,max_weight_kg,max_length_cm,max_width_cm,max_height_cm) VALUES ('box-136','BOX136','13.6m Box Truck',22000,1360,245,270),('flatbed','FLATBED','Flatbed',25000,1360,250,300),('lowbed','LOWBED','Lowbed',40000,1600,300,350);
-- statement
INSERT INTO routes(id,route_code,origin_country_id,origin_city_id,destination_country_id,destination_city_id,deposit_rate_bps,service_fee_cents) VALUES ('horgos-almaty','CNH-KZA','cn','horgos','kz','almaty',3000,80000),('horgos-astana','CNH-KZS','cn','horgos','kz','astana',3000,80000),('horgos-tashkent','CNH-UZT','cn','horgos','uz','tashkent',3000,80000);
