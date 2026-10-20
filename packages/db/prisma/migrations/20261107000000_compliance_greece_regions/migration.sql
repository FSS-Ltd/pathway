-- Current thirteen administrative regions: https://www.gov.gr/en/regions
-- ISO 3166-2 region codes and self-governed Mount Athos:
-- https://www.iso.org/iso/iso_3166-2_newsletter_ii-1_corrected_2010-02-19.pdf
-- Reviewed 2026-10-20. Additive location reference data; local rules remain in review.
WITH greece AS (
  SELECT id FROM "Jurisdiction" WHERE "countryCode" = 'GR' AND level = 'COUNTRY' ORDER BY id LIMIT 1
), regions(code, name) AS (
  VALUES
    ('A', 'East Macedonia and Thrace'),
    ('B', 'Central Macedonia'),
    ('C', 'West Macedonia'),
    ('D', 'Epirus'),
    ('E', 'Thessaly'),
    ('F', 'Ionian Islands'),
    ('G', 'Western Greece'),
    ('H', 'Central Greece'),
    ('I', 'Attica'),
    ('J', 'Peloponnese'),
    ('K', 'North Aegean'),
    ('L', 'South Aegean'),
    ('M', 'Crete'),
    ('69', 'Mount Athos (self-governed part)')
)
INSERT INTO "Jurisdiction" (id, "countryCode", "subdivisionCode", name, level, "parentJurisdictionId", "contentStatus")
SELECT md5('nexsteps-gr-region:' || regions.code)::uuid::text,
       'GR', 'GR-' || regions.code, regions.name, 'REGION',
       greece.id, 'NOT_CONFIGURED'
FROM regions CROSS JOIN greece
WHERE NOT EXISTS (
  SELECT 1 FROM "Jurisdiction" existing
  WHERE existing."countryCode" = 'GR' AND existing."subdivisionCode" = 'GR-' || regions.code
);
