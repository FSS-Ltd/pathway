-- Northern Ireland local government districts from ONS April 2025 LAD names and codes.
-- https://www.data.gov.uk/dataset/b2c91962-58e7-40f1-ad56-7aa2473a93fd/local-authority-districts-april-2025-names-and-codes-in-the-uk-v2
-- Geography selectors only; district-specific duties remain IN_REVIEW.
WITH northern_ireland AS (
  SELECT id FROM "Jurisdiction" WHERE "subdivisionCode" = 'GB-NIR' AND level = 'NATION' ORDER BY id LIMIT 1
), districts(code, name) AS (
  VALUES
    ('N09000001', 'Antrim and Newtownabbey'),
    ('N09000002', 'Armagh City, Banbridge and Craigavon'),
    ('N09000003', 'Belfast'),
    ('N09000004', 'Causeway Coast and Glens'),
    ('N09000005', 'Derry City and Strabane'),
    ('N09000006', 'Fermanagh and Omagh'),
    ('N09000007', 'Lisburn and Castlereagh'),
    ('N09000008', 'Mid and East Antrim'),
    ('N09000009', 'Mid Ulster'),
    ('N09000010', 'Newry, Mourne and Down'),
    ('N09000011', 'Ards and North Down')
)
INSERT INTO "Jurisdiction" (id, "countryCode", "subdivisionCode", name, level, "parentJurisdictionId", "contentStatus")
SELECT md5('nexsteps-northern-ireland-district:' || districts.code)::uuid::text,
       'GB', 'GB-NIR-' || districts.code, districts.name, 'LOCAL_AUTHORITY', northern_ireland.id, 'NOT_CONFIGURED'
FROM districts CROSS JOIN northern_ireland
WHERE NOT EXISTS (
  SELECT 1 FROM "Jurisdiction" existing
  WHERE existing."countryCode" = 'GB' AND existing."subdivisionCode" = 'GB-NIR-' || districts.code
);
