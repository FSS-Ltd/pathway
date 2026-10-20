-- Lithuania: official State Data Agency municipality layer, reviewed 2026-10-20.
-- https://osp-sdg.stat.gov.lt/arcgis/rest/services/Hosted/Municipalities/FeatureServer/0
-- Ten counties and sixty municipalities; local obligations remain in review.
WITH lithuania AS (
  SELECT id FROM "Jurisdiction" WHERE "countryCode" = 'LT' AND level = 'COUNTRY' ORDER BY id LIMIT 1
), counties(code, name) AS (
  VALUES
    ('01', 'Alytaus apskritis'),
    ('02', 'Kauno apskritis'),
    ('03', 'Klaipėdos apskritis'),
    ('04', 'Marijampolės apskritis'),
    ('05', 'Panevėžio apskritis'),
    ('06', 'Šiaulių apskritis'),
    ('07', 'Tauragės apskritis'),
    ('08', 'Telšių apskritis'),
    ('09', 'Utenos apskritis'),
    ('10', 'Vilniaus apskritis')
)
INSERT INTO "Jurisdiction" (id, "countryCode", "subdivisionCode", name, level, "parentJurisdictionId", "contentStatus")
SELECT md5('nexsteps-lt-aps:' || counties.code)::uuid::text,
       'LT', 'LT-APS-' || counties.code, counties.name, 'REGION',
       lithuania.id, 'NOT_CONFIGURED'
FROM counties CROSS JOIN lithuania
WHERE NOT EXISTS (
  SELECT 1 FROM "Jurisdiction" existing
  WHERE existing."countryCode" = 'LT' AND existing."subdivisionCode" = 'LT-APS-' || counties.code
);

WITH municipalities(code, name, county_code) AS (
  VALUES
    ('11', 'Alytaus miesto savivaldybė', '01'),
    ('12', 'Birštono savivaldybė', '02'),
    ('13', 'Vilniaus miesto savivaldybė', '10'),
    ('15', 'Druskininkų savivaldybė', '01'),
    ('18', 'Marijampolės savivaldybė', '04'),
    ('19', 'Kauno miesto savivaldybė', '02'),
    ('21', 'Klaipėdos miesto savivaldybė', '03'),
    ('23', 'Neringos savivaldybė', '03'),
    ('25', 'Palangos miesto savivaldybė', '03'),
    ('27', 'Panevėžio miesto savivaldybė', '05'),
    ('29', 'Šiaulių miesto savivaldybė', '06'),
    ('30', 'Visagino savivaldybė', '09'),
    ('32', 'Akmenės rajono savivaldybė', '06'),
    ('33', 'Alytaus rajono savivaldybė', '01'),
    ('34', 'Anykščių rajono savivaldybė', '09'),
    ('36', 'Biržų rajono savivaldybė', '05'),
    ('38', 'Varėnos rajono savivaldybė', '01'),
    ('39', 'Vilkaviškio rajono savivaldybė', '04'),
    ('41', 'Vilniaus rajono savivaldybė', '10'),
    ('42', 'Elektrėnų savivaldybė', '10'),
    ('43', 'Zarasų rajono savivaldybė', '09'),
    ('45', 'Ignalinos rajono savivaldybė', '09'),
    ('46', 'Jonavos rajono savivaldybė', '02'),
    ('47', 'Joniškio rajono savivaldybė', '06'),
    ('48', 'Kalvarijos savivaldybė', '04'),
    ('49', 'Kaišiadorių rajono savivaldybė', '02'),
    ('52', 'Kauno rajono savivaldybė', '02'),
    ('53', 'Kėdainių rajono savivaldybė', '02'),
    ('54', 'Kelmės rajono savivaldybė', '06'),
    ('55', 'Klaipėdos rajono savivaldybė', '03'),
    ('56', 'Kretingos rajono savivaldybė', '03'),
    ('57', 'Kupiškio rajono savivaldybė', '05'),
    ('58', 'Kazlų Rūdos savivaldybė', '04'),
    ('59', 'Lazdijų rajono savivaldybė', '01'),
    ('61', 'Mažeikių rajono savivaldybė', '08'),
    ('62', 'Molėtų rajono savivaldybė', '09'),
    ('63', 'Pagėgių savivaldybė', '07'),
    ('65', 'Pakruojo rajono savivaldybė', '06'),
    ('66', 'Panevėžio rajono savivaldybė', '05'),
    ('67', 'Pasvalio rajono savivaldybė', '05'),
    ('68', 'Plungės rajono savivaldybė', '08'),
    ('69', 'Prienų rajono savivaldybė', '02'),
    ('71', 'Radviliškio rajono savivaldybė', '06'),
    ('72', 'Raseinių rajono savivaldybė', '02'),
    ('73', 'Rokiškio rajono savivaldybė', '05'),
    ('74', 'Rietavo savivaldybė', '08'),
    ('75', 'Skuodo rajono savivaldybė', '03'),
    ('77', 'Tauragės rajono savivaldybė', '07'),
    ('78', 'Telšių rajono savivaldybė', '08'),
    ('79', 'Trakų rajono savivaldybė', '10'),
    ('81', 'Ukmergės rajono savivaldybė', '10'),
    ('82', 'Utenos rajono savivaldybė', '09'),
    ('84', 'Šakių rajono savivaldybė', '04'),
    ('85', 'Šalčininkų rajono savivaldybė', '10'),
    ('86', 'Švenčionių rajono savivaldybė', '10'),
    ('87', 'Šilalės rajono savivaldybė', '07'),
    ('88', 'Šilutės rajono savivaldybė', '03'),
    ('89', 'Širvintų rajono savivaldybė', '10'),
    ('91', 'Šiaulių rajono savivaldybė', '06'),
    ('94', 'Jurbarko rajono savivaldybė', '07')
)
INSERT INTO "Jurisdiction" (id, "countryCode", "subdivisionCode", name, level, "parentJurisdictionId", "contentStatus")
SELECT md5('nexsteps-lt-sav:' || municipalities.code)::uuid::text,
       'LT', 'LT-SAV-' || municipalities.code, municipalities.name, 'LOCAL_AUTHORITY',
       county.id, 'NOT_CONFIGURED'
FROM municipalities
JOIN "Jurisdiction" county ON county."countryCode" = 'LT' AND county."subdivisionCode" = 'LT-APS-' || municipalities.county_code
WHERE NOT EXISTS (
  SELECT 1 FROM "Jurisdiction" existing
  WHERE existing."countryCode" = 'LT' AND existing."subdivisionCode" = 'LT-SAV-' || municipalities.code
);
