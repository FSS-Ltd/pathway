-- Twenty current regions: https://www.istat.it/classificazione/codici-dei-comuni-delle-province-e-delle-regioni/
-- ISO 3166-2 codes, including autonomous provinces: https://www.iso.org/iso/iso_3166-2_newsletter_ii-1_corrected_2010-02-19.pdf
-- Reviewed 2026-10-20. Additive location reference data; local duties remain in review.
WITH italy AS (
  SELECT id FROM "Jurisdiction" WHERE "countryCode" = 'IT' AND level = 'COUNTRY' ORDER BY id LIMIT 1
), regions(code, name) AS (
  VALUES
    ('65', 'Abruzzo'),
    ('77', 'Basilicata'),
    ('78', 'Calabria'),
    ('72', 'Campania'),
    ('45', 'Emilia-Romagna'),
    ('36', 'Friuli-Venezia Giulia'),
    ('62', 'Lazio'),
    ('42', 'Liguria'),
    ('25', 'Lombardia'),
    ('57', 'Marche'),
    ('67', 'Molise'),
    ('21', 'Piemonte'),
    ('75', 'Puglia'),
    ('88', 'Sardegna'),
    ('82', 'Sicilia'),
    ('52', 'Toscana'),
    ('32', 'Trentino-Alto Adige/Südtirol'),
    ('55', 'Umbria'),
    ('23', 'Valle d''Aosta/Vallée d''Aoste'),
    ('34', 'Veneto')
)
INSERT INTO "Jurisdiction" (id, "countryCode", "subdivisionCode", name, level, "parentJurisdictionId", "contentStatus")
SELECT md5('nexsteps-it-region:' || regions.code)::uuid::text,
       'IT', 'IT-' || regions.code, regions.name, 'REGION',
       italy.id, 'NOT_CONFIGURED'
FROM regions CROSS JOIN italy
WHERE NOT EXISTS (
  SELECT 1 FROM "Jurisdiction" existing
  WHERE existing."countryCode" = 'IT' AND existing."subdivisionCode" = 'IT-' || regions.code
);

WITH italy AS (
  SELECT id FROM "Jurisdiction" WHERE "countryCode" = 'IT' AND level = 'COUNTRY' ORDER BY id LIMIT 1
), provinces(code, name) AS (
  VALUES
    ('TN', 'Trento (autonomous province)'),
    ('BZ', 'Bolzano/Bozen (autonomous province)')
)
INSERT INTO "Jurisdiction" (id, "countryCode", "subdivisionCode", name, level, "parentJurisdictionId", "contentStatus")
SELECT md5('nexsteps-it-autonomous-province:' || provinces.code)::uuid::text,
       'IT', 'IT-' || provinces.code, provinces.name, 'REGION',
       italy.id, 'NOT_CONFIGURED'
FROM provinces CROSS JOIN italy
WHERE NOT EXISTS (
  SELECT 1 FROM "Jurisdiction" existing
  WHERE existing."countryCode" = 'IT' AND existing."subdivisionCode" = 'IT-' || provinces.code
);
