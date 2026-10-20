-- German Länder and ISO 3166-2 suffixes from the Federal Agency for Cartography
-- and Geodesy's VG administrative-area documentation (LKZ inventory):
-- https://sgx.geodatenzentrum.de/web_public/gdz/dokumentation/deu/annex_vg.pdf
-- Reviewed 2026-10-20. Additive reference data only; local rules remain in review.
WITH germany AS (
  SELECT id FROM "Jurisdiction" WHERE "countryCode" = 'DE' AND level = 'COUNTRY' ORDER BY id LIMIT 1
), lands(code, name) AS (
  VALUES
    ('BW', 'Baden-Württemberg'),
    ('BY', 'Bayern'),
    ('BE', 'Berlin'),
    ('BB', 'Brandenburg'),
    ('HB', 'Bremen'),
    ('HH', 'Hamburg'),
    ('HE', 'Hessen'),
    ('MV', 'Mecklenburg-Vorpommern'),
    ('NI', 'Niedersachsen'),
    ('NW', 'Nordrhein-Westfalen'),
    ('RP', 'Rheinland-Pfalz'),
    ('SL', 'Saarland'),
    ('SN', 'Sachsen'),
    ('ST', 'Sachsen-Anhalt'),
    ('SH', 'Schleswig-Holstein'),
    ('TH', 'Thüringen')
)
INSERT INTO "Jurisdiction" (id, "countryCode", "subdivisionCode", name, level, "parentJurisdictionId", "contentStatus")
SELECT md5('nexsteps-de-land:' || lands.code)::uuid::text,
       'DE', 'DE-' || lands.code, lands.name, 'REGION',
       germany.id, 'NOT_CONFIGURED'
FROM lands CROSS JOIN germany
WHERE NOT EXISTS (
  SELECT 1 FROM "Jurisdiction" existing
  WHERE existing."countryCode" = 'DE' AND existing."subdivisionCode" = 'DE-' || lands.code
);
