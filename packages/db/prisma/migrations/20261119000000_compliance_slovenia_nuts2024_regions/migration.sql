-- Slovenia: Eurostat GISCO NUTS 2024 level 3 (twelve statistical regions), verified 2026-10-20.
-- https://gisco-services.ec.europa.eu/distribution/v2/nuts/csv/NUTS_AT_2024.csv
-- These codes select territory only; municipalities and local rules remain in review.
WITH slovenia AS (
  SELECT id FROM "Jurisdiction" WHERE "countryCode" = 'SI' AND level = 'COUNTRY' ORDER BY id LIMIT 1
), regions(code, name) AS (
  VALUES
    ('SI031', 'Pomurska'),
    ('SI032', 'Podravska'),
    ('SI033', 'Koroška'),
    ('SI034', 'Savinjska'),
    ('SI035', 'Zasavska'),
    ('SI036', 'Posavska'),
    ('SI037', 'Jugovzhodna Slovenija'),
    ('SI038', 'Primorsko-notranjska'),
    ('SI041', 'Osrednjeslovenska'),
    ('SI042', 'Gorenjska'),
    ('SI043', 'Goriška'),
    ('SI044', 'Obalno-kraška')
)
INSERT INTO "Jurisdiction" (id, "countryCode", "subdivisionCode", name, level, "parentJurisdictionId", "contentStatus")
SELECT md5('nexsteps-si-region:' || regions.code)::uuid::text,
       'SI', regions.code, regions.name, 'REGION', slovenia.id, 'NOT_CONFIGURED'
FROM regions CROSS JOIN slovenia
WHERE NOT EXISTS (
  SELECT 1 FROM "Jurisdiction" existing
  WHERE existing."countryCode" = 'SI' AND existing."subdivisionCode" = regions.code
);
