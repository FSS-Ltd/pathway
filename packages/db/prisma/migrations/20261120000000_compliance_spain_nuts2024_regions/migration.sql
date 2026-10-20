-- Spain: Eurostat GISCO NUTS 2024 level 2, verified 2026-10-20.
-- https://gisco-services.ec.europa.eu/distribution/v2/nuts/csv/NUTS_AT_2024.csv
-- Territorial selectors only; autonomous-community law and municipal decisions remain in review.
WITH spain AS (
  SELECT id FROM "Jurisdiction" WHERE "countryCode" = 'ES' AND level = 'COUNTRY' ORDER BY id LIMIT 1
), regions(code, name) AS (
  VALUES
    ('ES11', 'Galicia'),
    ('ES12', 'Principado de Asturias'),
    ('ES13', 'Cantabria'),
    ('ES21', 'País Vasco'),
    ('ES22', 'Comunidad Foral de Navarra'),
    ('ES23', 'La Rioja'),
    ('ES24', 'Aragón'),
    ('ES30', 'Comunidad de Madrid'),
    ('ES41', 'Castilla y León'),
    ('ES42', 'Castilla-La Mancha'),
    ('ES43', 'Extremadura'),
    ('ES51', 'Cataluña'),
    ('ES52', 'Comunitat Valenciana'),
    ('ES53', 'Illes Balears'),
    ('ES61', 'Andalucía'),
    ('ES62', 'Región de Murcia'),
    ('ES63', 'Ciudad de Ceuta'),
    ('ES64', 'Ciudad de Melilla'),
    ('ES70', 'Canarias')
)
INSERT INTO "Jurisdiction" (id, "countryCode", "subdivisionCode", name, level, "parentJurisdictionId", "contentStatus")
SELECT md5('nexsteps-es-region:' || regions.code)::uuid::text,
       'ES', regions.code, regions.name, 'REGION', spain.id, 'NOT_CONFIGURED'
FROM regions CROSS JOIN spain
WHERE NOT EXISTS (
  SELECT 1 FROM "Jurisdiction" existing
  WHERE existing."countryCode" = 'ES' AND existing."subdivisionCode" = regions.code
);
