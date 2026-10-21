-- Nine Austrian Bundesländer and ISO 3166-2 codes from the government EDM list 3012.
-- https://edm.gv.at/edm_portal/redaList.do?display=plain&lang=de&seqCode=yj86by532rpgb4
-- Geography selectors only; Land-specific duties remain IN_REVIEW.
WITH austria AS (
  SELECT id FROM "Jurisdiction" WHERE "countryCode" = 'AT' AND level = 'COUNTRY' ORDER BY id LIMIT 1
), lands(code, name) AS (
  VALUES
    ('AT-1', 'Burgenland'),
    ('AT-2', 'Kärnten'),
    ('AT-3', 'Niederösterreich'),
    ('AT-4', 'Oberösterreich'),
    ('AT-5', 'Salzburg'),
    ('AT-6', 'Steiermark'),
    ('AT-7', 'Tirol'),
    ('AT-8', 'Vorarlberg'),
    ('AT-9', 'Wien')
)
INSERT INTO "Jurisdiction" (id, "countryCode", "subdivisionCode", name, level, "parentJurisdictionId", "contentStatus")
SELECT md5('nexsteps-austria-land:' || lands.code)::uuid::text,
       'AT', lands.code, lands.name, 'REGION', austria.id, 'NOT_CONFIGURED'
FROM lands CROSS JOIN austria
WHERE NOT EXISTS (
  SELECT 1 FROM "Jurisdiction" existing
  WHERE existing."countryCode" = 'AT' AND existing."subdivisionCode" = lands.code
);
