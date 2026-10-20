-- Current nineteen counties and Budapest: https://www.ksh.hu/regionalatlas_counties?lang=en
-- Subdivision codes: https://service.unece.org/trade/locode/2023-1%20SubdivisionCodes.htm
-- Reviewed 2026-10-20. Additive location reference data; county/municipal rules remain in review.
WITH hungary AS (
  SELECT id FROM "Jurisdiction" WHERE "countryCode" = 'HU' AND level = 'COUNTRY' ORDER BY id LIMIT 1
), counties(code, name) AS (
  VALUES
    ('BA', 'Baranya'),
    ('BK', 'Bács-Kiskun'),
    ('BE', 'Békés'),
    ('BZ', 'Borsod-Abaúj-Zemplén'),
    ('BU', 'Budapest (capital city)'),
    ('CS', 'Csongrád-Csanád'),
    ('FE', 'Fejér'),
    ('GS', 'Győr-Moson-Sopron'),
    ('HB', 'Hajdú-Bihar'),
    ('HE', 'Heves'),
    ('JN', 'Jász-Nagykun-Szolnok'),
    ('KE', 'Komárom-Esztergom'),
    ('NO', 'Nógrád'),
    ('PE', 'Pest'),
    ('SO', 'Somogy'),
    ('SZ', 'Szabolcs-Szatmár-Bereg'),
    ('TO', 'Tolna'),
    ('VA', 'Vas'),
    ('VE', 'Veszprém'),
    ('ZA', 'Zala')
)
INSERT INTO "Jurisdiction" (id, "countryCode", "subdivisionCode", name, level, "parentJurisdictionId", "contentStatus")
SELECT md5('nexsteps-hu-county:' || counties.code)::uuid::text,
       'HU', 'HU-' || counties.code, counties.name, 'REGION',
       hungary.id, 'NOT_CONFIGURED'
FROM counties CROSS JOIN hungary
WHERE NOT EXISTS (
  SELECT 1 FROM "Jurisdiction" existing
  WHERE existing."countryCode" = 'HU' AND existing."subdivisionCode" = 'HU-' || counties.code
);
