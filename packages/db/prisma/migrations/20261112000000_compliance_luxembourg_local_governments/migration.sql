-- Luxembourg: Geoportail administrative communes layer, synchronized 2026-10-18.
-- https://features.geoportail.lu/collections/302/items?f=html
-- Twelve cantons and 100 communes; local obligations remain in review.
WITH luxembourg AS (
  SELECT id FROM "Jurisdiction" WHERE "countryCode" = 'LU' AND level = 'COUNTRY' ORDER BY id LIMIT 1
), cantons(code, name) AS (
  VALUES
    ('01', 'Capellen'),
    ('02', 'Esch-sur-Alzette'),
    ('03', 'Luxembourg'),
    ('04', 'Mersch'),
    ('05', 'Clervaux'),
    ('06', 'Diekirch'),
    ('07', 'Redange'),
    ('08', 'Wiltz'),
    ('09', 'Vianden'),
    ('10', 'Echternach'),
    ('11', 'Grevenmacher'),
    ('12', 'Remich')
)
INSERT INTO "Jurisdiction" (id, "countryCode", "subdivisionCode", name, level, "parentJurisdictionId", "contentStatus")
SELECT md5('nexsteps-lu-canton:' || cantons.code)::uuid::text,
       'LU', 'LU-CANTON-' || cantons.code, cantons.name, 'REGION',
       luxembourg.id, 'NOT_CONFIGURED'
FROM cantons CROSS JOIN luxembourg
WHERE NOT EXISTS (
  SELECT 1 FROM "Jurisdiction" existing
  WHERE existing."countryCode" = 'LU' AND existing."subdivisionCode" = 'LU-CANTON-' || cantons.code
);

WITH communes(code, name, canton_code) AS (
  VALUES
    ('0101', 'Dippach', '01'),
    ('0102', 'Garnich', '01'),
    ('0103', 'Habscht', '01'),
    ('0104', 'Käerjeng', '01'),
    ('0105', 'Kehlen', '01'),
    ('0106', 'Koerich', '01'),
    ('0107', 'Kopstal', '01'),
    ('0108', 'Mamer', '01'),
    ('0110', 'Steinfort', '01'),
    ('0201', 'Bettembourg', '02'),
    ('0202', 'Differdange', '02'),
    ('0203', 'Dudelange', '02'),
    ('0204', 'Esch-sur-Alzette', '02'),
    ('0205', 'Frisange', '02'),
    ('0206', 'Kayl', '02'),
    ('0207', 'Leudelange', '02'),
    ('0208', 'Mondercange', '02'),
    ('0209', 'Pétange', '02'),
    ('0210', 'Reckange-sur-Mess', '02'),
    ('0211', 'Roeser', '02'),
    ('0212', 'Rumelange', '02'),
    ('0213', 'Sanem', '02'),
    ('0214', 'Schifflange', '02'),
    ('0301', 'Bertrange', '03'),
    ('0302', 'Contern', '03'),
    ('0303', 'Hesperange', '03'),
    ('0304', 'Luxembourg', '03'),
    ('0305', 'Niederanven', '03'),
    ('0306', 'Sandweiler', '03'),
    ('0307', 'Schuttrange', '03'),
    ('0308', 'Steinsel', '03'),
    ('0309', 'Strassen', '03'),
    ('0310', 'Walferdange', '03'),
    ('0311', 'Weiler-la-Tour', '03'),
    ('0401', 'Colmar-Berg', '04'),
    ('0402', 'Bissen', '04'),
    ('0403', 'Helperknapp', '04'),
    ('0404', 'Fischbach', '04'),
    ('0405', 'Heffingen', '04'),
    ('0406', 'Larochette', '04'),
    ('0407', 'Lintgen', '04'),
    ('0408', 'Lorentzweiler', '04'),
    ('0409', 'Mersch', '04'),
    ('0410', 'Nommern', '04'),
    ('0501', 'Clervaux', '05'),
    ('0502', 'Wincrange', '05'),
    ('0503', 'Parc Hosingen', '05'),
    ('0504', 'Troisvierges', '05'),
    ('0505', 'Weiswampach', '05'),
    ('0601', 'Bettendorf', '06'),
    ('0602', 'Bourscheid', '06'),
    ('0603', 'Diekirch', '06'),
    ('0604', 'Erpeldange-sur-Sûre', '06'),
    ('0605', 'Ettelbruck', '06'),
    ('0606', 'Feulen', '06'),
    ('0607', 'Mertzig', '06'),
    ('0608', 'Reisdorf', '06'),
    ('0609', 'Schieren', '06'),
    ('0610', 'Vallée de l''Ernz', '06'),
    ('0701', 'Beckerich', '07'),
    ('0702', 'Préizerdaul', '07'),
    ('0703', 'Ell', '07'),
    ('0704', 'Rambrouch', '07'),
    ('0706', 'Redange/Attert', '07'),
    ('0707', 'Saeul', '07'),
    ('0708', 'Useldange', '07'),
    ('0709', 'Vichten', '07'),
    ('0711', 'Groussbus-Wal', '07'),
    ('0801', 'Boulaide', '08'),
    ('0802', 'Esch-sur-Sûre', '08'),
    ('0804', 'Goesdorf', '08'),
    ('0805', 'Kiischpelt', '08'),
    ('0806', 'Lac de la Haute-Sûre', '08'),
    ('0807', 'Wiltz', '08'),
    ('0808', 'Winseler', '08'),
    ('0901', 'Tandel', '09'),
    ('0902', 'Putscheid', '09'),
    ('0903', 'Vianden', '09'),
    ('1001', 'Beaufort', '10'),
    ('1002', 'Bech', '10'),
    ('1003', 'Berdorf', '10'),
    ('1004', 'Consdorf', '10'),
    ('1005', 'Echternach', '10'),
    ('1006', 'Rosport-Mompach', '10'),
    ('1008', 'Waldbillig', '10'),
    ('1101', 'Betzdorf', '11'),
    ('1102', 'Biwer', '11'),
    ('1103', 'Flaxweiler', '11'),
    ('1104', 'Grevenmacher', '11'),
    ('1105', 'Junglinster', '11'),
    ('1106', 'Manternach', '11'),
    ('1107', 'Mertert', '11'),
    ('1108', 'Wormeldange', '11'),
    ('1202', 'Dalheim', '12'),
    ('1203', 'Lenningen', '12'),
    ('1204', 'Mondorf-les-Bains', '12'),
    ('1205', 'Remich', '12'),
    ('1206', 'Schengen', '12'),
    ('1207', 'Stadtbredimus', '12'),
    ('1209', 'Bous-Waldbredimus', '12')
)
INSERT INTO "Jurisdiction" (id, "countryCode", "subdivisionCode", name, level, "parentJurisdictionId", "contentStatus")
SELECT md5('nexsteps-lu-lau2:' || communes.code)::uuid::text,
       'LU', 'LU-LAU2-' || communes.code, communes.name, 'LOCAL_AUTHORITY',
       canton.id, 'NOT_CONFIGURED'
FROM communes
JOIN "Jurisdiction" canton ON canton."countryCode" = 'LU' AND canton."subdivisionCode" = 'LU-CANTON-' || communes.canton_code
WHERE NOT EXISTS (
  SELECT 1 FROM "Jurisdiction" existing
  WHERE existing."countryCode" = 'LU' AND existing."subdivisionCode" = 'LU-LAU2-' || communes.code
);
