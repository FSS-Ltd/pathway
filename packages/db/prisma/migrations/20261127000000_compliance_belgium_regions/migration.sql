-- Eurostat NUTS 2024 level 1 geographic Regions.
-- https://ec.europa.eu/eurostat/web/nuts/correspondence-tables
-- Language Communities overlap these Regions and require separate classification.
WITH belgium AS (
  SELECT id FROM "Jurisdiction" WHERE "countryCode" = 'BE' AND level = 'COUNTRY' ORDER BY id LIMIT 1
), regions(code, name) AS (
  VALUES
    ('BE1', 'Brussels-Capital Region'),
    ('BE2', 'Flemish Region'),
    ('BE3', 'Walloon Region')
)
INSERT INTO "Jurisdiction" (id, "countryCode", "subdivisionCode", name, level, "parentJurisdictionId", "contentStatus")
SELECT md5('nexsteps-belgium-region:' || regions.code)::uuid::text,
       'BE', regions.code, regions.name, 'REGION', belgium.id, 'NOT_CONFIGURED'
FROM regions CROSS JOIN belgium
WHERE NOT EXISTS (
  SELECT 1 FROM "Jurisdiction" existing
  WHERE existing."countryCode" = 'BE' AND existing."subdivisionCode" = regions.code
);
