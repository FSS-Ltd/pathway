-- Malta: Office of the Address Registrar current local-council table, retrieved 2026-10-20.
-- https://address.gov.mt/local-council/ and https://address.gov.mt/regions/
-- Six regional councils and 68 local councils; local legal duties remain in review.
WITH malta AS (
  SELECT id FROM "Jurisdiction" WHERE "countryCode" = 'MT' AND level = 'COUNTRY' ORDER BY id LIMIT 1
), regions(code, name) AS (
  VALUES
    ('MT-REGION-EASTERN', 'Eastern Region'),
    ('MT-REGION-GOZO', 'Gozo Region'),
    ('MT-REGION-NORTHERN', 'Northern Region'),
    ('MT-REGION-PORT', 'Port Region'),
    ('MT-REGION-SOUTHERN', 'Southern Region'),
    ('MT-REGION-WESTERN', 'Western Region')
)
INSERT INTO "Jurisdiction" (id, "countryCode", "subdivisionCode", name, level, "parentJurisdictionId", "contentStatus")
SELECT md5('nexsteps-mt-region:' || regions.code)::uuid::text,
       'MT', regions.code, regions.name, 'REGION', malta.id, 'NOT_CONFIGURED'
FROM regions CROSS JOIN malta
WHERE NOT EXISTS (
  SELECT 1 FROM "Jurisdiction" existing
  WHERE existing."countryCode" = 'MT' AND existing."subdivisionCode" = regions.code
);

WITH councils(code, name, region_code) AS (
  VALUES
    ('MT-LC-L-IMTARFA', 'L-Imtarfa', 'MT-REGION-NORTHERN'),
    ('MT-LC-IZ-ZURRIEQ', 'Iż-Żurrieq', 'MT-REGION-WESTERN'),
    ('MT-LC-IZ-ZEBBUG-GHAWDEX', 'Iż-Żebbuġ (Għawdex)', 'MT-REGION-GOZO'),
    ('MT-LC-IX-XGHAJRA', 'Ix-Xgħajra', 'MT-REGION-PORT'),
    ('MT-LC-IX-XEWKIJA', 'Ix-Xewkija', 'MT-REGION-GOZO'),
    ('MT-LC-IX-XAGHRA', 'Ix-Xagħra', 'MT-REGION-GOZO'),
    ('MT-LC-HAL-TARXIEN', 'Ħal Tarxien', 'MT-REGION-PORT'),
    ('MT-LC-TA-XBIEX', 'Ta'' Xbiex', 'MT-REGION-EASTERN'),
    ('MT-LC-IS-SWIEQI', 'Is-Swieqi', 'MT-REGION-EASTERN'),
    ('MT-LC-TAS-SLIEMA', 'Tas-Sliema', 'MT-REGION-EASTERN'),
    ('MT-LC-SANTA-VENERA', 'Santa Venera', 'MT-REGION-SOUTHERN'),
    ('MT-LC-SANTA-LUCIJA', 'Santa Luċija', 'MT-REGION-SOUTHERN'),
    ('MT-LC-TA-SANNAT', 'Ta'' Sannat', 'MT-REGION-GOZO'),
    ('MT-LC-SAN-PAWL-IL-BAHAR', 'San Pawl il-Baħar', 'MT-REGION-NORTHERN'),
    ('MT-LC-SAN-LAWRENZ', 'San Lawrenz', 'MT-REGION-GOZO'),
    ('MT-LC-SAN-GWANN', 'San Ġwann', 'MT-REGION-NORTHERN'),
    ('MT-LC-SAN-GILJAN', 'San Ġiljan', 'MT-REGION-EASTERN'),
    ('MT-LC-HAL-SAFI', 'Ħal Safi', 'MT-REGION-WESTERN'),
    ('MT-LC-IR-RABAT-MALTA', 'Ir-Rabat (Malta)', 'MT-REGION-WESTERN'),
    ('MT-LC-IL-QRENDI', 'Il-Qrendi', 'MT-REGION-WESTERN'),
    ('MT-LC-IL-QALA', 'Il-Qala', 'MT-REGION-GOZO'),
    ('MT-LC-TAL-PIETA', 'Tal-Pietà', 'MT-REGION-EASTERN'),
    ('MT-LC-PEMBROKE', 'Pembroke', 'MT-REGION-EASTERN'),
    ('MT-LC-PAOLA', 'Paola', 'MT-REGION-PORT'),
    ('MT-LC-IN-NAXXAR', 'In-Naxxar', 'MT-REGION-NORTHERN'),
    ('MT-LC-IN-NADUR', 'In-Nadur', 'MT-REGION-GOZO'),
    ('MT-LC-IL-MUNXAR', 'Il-Munxar', 'MT-REGION-GOZO'),
    ('MT-LC-L-IMSIDA', 'L-Imsida', 'MT-REGION-EASTERN'),
    ('MT-LC-L-IMQABBA', 'L-Imqabba', 'MT-REGION-WESTERN'),
    ('MT-LC-IL-MOSTA', 'Il-Mosta', 'MT-REGION-NORTHERN'),
    ('MT-LC-L-IMGARR', 'L-Imġarr', 'MT-REGION-NORTHERN'),
    ('MT-LC-IL-MELLIEHA', 'Il-Mellieħa', 'MT-REGION-NORTHERN'),
    ('MT-LC-MARSAXLOKK', 'Marsaxlokk', 'MT-REGION-SOUTHERN'),
    ('MT-LC-MARSASKALA', 'Marsaskala', 'MT-REGION-SOUTHERN'),
    ('MT-LC-IL-MARSA', 'Il-Marsa', 'MT-REGION-SOUTHERN'),
    ('MT-LC-HAL-LUQA', 'Ħal Luqa', 'MT-REGION-SOUTHERN'),
    ('MT-LC-HAL-LIJA', 'Ħal Lija', 'MT-REGION-EASTERN'),
    ('MT-LC-HAL-KIRKOP', 'Ħal Kirkop', 'MT-REGION-WESTERN'),
    ('MT-LC-TA-KERCEM', 'Ta'' Kerċem', 'MT-REGION-GOZO'),
    ('MT-LC-IL-KALKARA', 'Il-Kalkara', 'MT-REGION-PORT'),
    ('MT-LC-L-IKLIN', 'L-Iklin', 'MT-REGION-EASTERN'),
    ('MT-LC-IL-HAMRUN', 'Il-Ħamrun', 'MT-REGION-SOUTHERN'),
    ('MT-LC-HAL-GHAXAQ', 'Ħal Għaxaq', 'MT-REGION-SOUTHERN'),
    ('MT-LC-L-GHASRI', 'L-Għasri', 'MT-REGION-GOZO'),
    ('MT-LC-HAL-GHARGHUR', 'Ħal Għargħur', 'MT-REGION-EASTERN'),
    ('MT-LC-L-GHARB', 'L-Għarb', 'MT-REGION-GOZO'),
    ('MT-LC-GHAJNSIELEM', 'Għajnsielem', 'MT-REGION-GOZO'),
    ('MT-LC-IL-GZIRA', 'Il-Gżira', 'MT-REGION-EASTERN'),
    ('MT-LC-IL-GUDJA', 'Il-Gudja', 'MT-REGION-SOUTHERN'),
    ('MT-LC-IL-FONTANA', 'Il-Fontana', 'MT-REGION-GOZO'),
    ('MT-LC-FLORIANA', 'Floriana', 'MT-REGION-PORT'),
    ('MT-LC-IL-FGURA', 'Il-Fgura', 'MT-REGION-PORT'),
    ('MT-LC-HAD-DINGLI', 'Ħad-Dingli', 'MT-REGION-WESTERN'),
    ('MT-LC-BIRZEBBUGA', 'Birżebbuġa', 'MT-REGION-SOUTHERN'),
    ('MT-LC-BIRKIRKARA', 'Birkirkara', 'MT-REGION-EASTERN'),
    ('MT-LC-HAL-BALZAN', 'Ħal Balzan', 'MT-REGION-NORTHERN'),
    ('MT-LC-H-ATTARD', 'Ħ''Attard', 'MT-REGION-NORTHERN'),
    ('MT-LC-IR-RABAT-GHAWDEX', 'Ir-Rabat (Għawdex)', 'MT-REGION-GOZO'),
    ('MT-LC-IZ-ZEJTUN', 'Iż-Żejtun', 'MT-REGION-SOUTHERN'),
    ('MT-LC-IS-SIGGIEWI', 'Is-Siġġiewi', 'MT-REGION-WESTERN'),
    ('MT-LC-HAZ-ZABBAR', 'Ħaż-Żabbar', 'MT-REGION-PORT'),
    ('MT-LC-HAZ-ZEBBUG-MALTA', 'Ħaż-Żebbuġ (Malta)', 'MT-REGION-WESTERN'),
    ('MT-LC-HAL-QORMI', 'Ħal Qormi', 'MT-REGION-SOUTHERN'),
    ('MT-LC-BORMLA', 'Bormla', 'MT-REGION-PORT'),
    ('MT-LC-L-ISLA', 'L-Isla', 'MT-REGION-PORT'),
    ('MT-LC-IL-BIRGU', 'Il-Birgu', 'MT-REGION-PORT'),
    ('MT-LC-L-IMDINA', 'L-Imdina', 'MT-REGION-WESTERN'),
    ('MT-LC-IL-BELT-VALLETTA', 'Il-Belt Valletta', 'MT-REGION-PORT')
)
INSERT INTO "Jurisdiction" (id, "countryCode", "subdivisionCode", name, level, "parentJurisdictionId", "contentStatus")
SELECT md5('nexsteps-mt-council:' || councils.code)::uuid::text,
       'MT', councils.code, councils.name, 'LOCAL_AUTHORITY', region.id, 'NOT_CONFIGURED'
FROM councils
JOIN "Jurisdiction" region ON region."countryCode" = 'MT' AND region."subdivisionCode" = councils.region_code
WHERE NOT EXISTS (
  SELECT 1 FROM "Jurisdiction" existing
  WHERE existing."countryCode" = 'MT' AND existing."subdivisionCode" = councils.code
);
