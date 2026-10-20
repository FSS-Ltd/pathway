-- Sweden: Eurostat GISCO NUTS 2024 level 3 (twenty-one counties), verified 2026-10-20.
-- https://gisco-services.ec.europa.eu/distribution/v2/nuts/csv/NUTS_AT_2024.csv
-- County selectors only; 290 municipalities and local decisions remain in review.
WITH sweden AS (
  SELECT id FROM "Jurisdiction" WHERE "countryCode" = 'SE' AND level = 'COUNTRY' ORDER BY id LIMIT 1
), counties(code, name) AS (
  VALUES
    ('SE110', 'Stockholms län'),
    ('SE121', 'Uppsala län'),
    ('SE122', 'Södermanlands län'),
    ('SE123', 'Östergötlands län'),
    ('SE124', 'Örebro län'),
    ('SE125', 'Västmanlands län'),
    ('SE211', 'Jönköpings län'),
    ('SE212', 'Kronobergs län'),
    ('SE213', 'Kalmar län'),
    ('SE214', 'Gotlands län'),
    ('SE221', 'Blekinge län'),
    ('SE224', 'Skåne län'),
    ('SE231', 'Hallands län'),
    ('SE232', 'Västra Götalands län'),
    ('SE311', 'Värmlands län'),
    ('SE312', 'Dalarnas län'),
    ('SE313', 'Gävleborgs län'),
    ('SE321', 'Västernorrlands län'),
    ('SE322', 'Jämtlands län'),
    ('SE331', 'Västerbottens län'),
    ('SE332', 'Norrbottens län')
)
INSERT INTO "Jurisdiction" (id, "countryCode", "subdivisionCode", name, level, "parentJurisdictionId", "contentStatus")
SELECT md5('nexsteps-se-county:' || counties.code)::uuid::text,
       'SE', counties.code, counties.name, 'REGION', sweden.id, 'NOT_CONFIGURED'
FROM counties CROSS JOIN sweden
WHERE NOT EXISTS (
  SELECT 1 FROM "Jurisdiction" existing
  WHERE existing."countryCode" = 'SE' AND existing."subdivisionCode" = counties.code
);
