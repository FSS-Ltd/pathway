-- Slovakia: Eurostat GISCO NUTS 2024 level 3 (eight kraje), verified 2026-10-20.
-- https://gisco-services.ec.europa.eu/distribution/v2/nuts/csv/NUTS_AT_2024.csv
-- These codes select territory only; they do not establish school permission.
WITH slovakia AS (
  SELECT id FROM "Jurisdiction" WHERE "countryCode" = 'SK' AND level = 'COUNTRY' ORDER BY id LIMIT 1
), regions(code, name) AS (
  VALUES
    ('SK010', 'Bratislavský kraj'),
    ('SK021', 'Trnavský kraj'),
    ('SK022', 'Trenčiansky kraj'),
    ('SK023', 'Nitriansky kraj'),
    ('SK031', 'Žilinský kraj'),
    ('SK032', 'Banskobystrický kraj'),
    ('SK041', 'Prešovský kraj'),
    ('SK042', 'Košický kraj')
)
INSERT INTO "Jurisdiction" (id, "countryCode", "subdivisionCode", name, level, "parentJurisdictionId", "contentStatus")
SELECT md5('nexsteps-sk-region:' || regions.code)::uuid::text,
       'SK', regions.code, regions.name, 'REGION', slovakia.id, 'NOT_CONFIGURED'
FROM regions CROSS JOIN slovakia
WHERE NOT EXISTS (
  SELECT 1 FROM "Jurisdiction" existing
  WHERE existing."countryCode" = 'SK' AND existing."subdivisionCode" = regions.code
);
