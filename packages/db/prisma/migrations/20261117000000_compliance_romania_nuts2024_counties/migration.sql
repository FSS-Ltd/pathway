-- Romania: Eurostat GISCO NUTS 2024 attribute table, retrieved 2026-10-20.
-- https://gisco-services.ec.europa.eu/distribution/v2/nuts/csv/NUTS_AT_2024.csv
-- NUTS 3 corresponds to 42 Romanian Județe (including Bucureşti), independently confirmed
-- by Eurostat's correspondence table updated 2026-04-27:
-- https://ec.europa.eu/eurostat/web/nuts/correspondence-tables
-- NUTS codes are territorial selectors, not school authorisations. SIRUTA 2026
-- municipality rows remain unseeded pending direct source verification.
WITH romania AS (
  SELECT id FROM "Jurisdiction" WHERE "countryCode" = 'RO' AND level = 'COUNTRY' ORDER BY id LIMIT 1
), counties(code, name) AS (
  VALUES
    ('RO111', 'Bihor'),
    ('RO112', 'Bistriţa-Năsăud'),
    ('RO113', 'Cluj'),
    ('RO114', 'Maramureş'),
    ('RO115', 'Satu Mare'),
    ('RO116', 'Sălaj'),
    ('RO121', 'Alba'),
    ('RO122', 'Braşov'),
    ('RO123', 'Covasna'),
    ('RO124', 'Harghita'),
    ('RO125', 'Mureş'),
    ('RO126', 'Sibiu'),
    ('RO211', 'Bacău'),
    ('RO212', 'Botoşani'),
    ('RO213', 'Iaşi'),
    ('RO214', 'Neamţ'),
    ('RO215', 'Suceava'),
    ('RO216', 'Vaslui'),
    ('RO221', 'Brăila'),
    ('RO222', 'Buzău'),
    ('RO223', 'Constanţa'),
    ('RO224', 'Galaţi'),
    ('RO225', 'Tulcea'),
    ('RO226', 'Vrancea'),
    ('RO311', 'Argeş'),
    ('RO312', 'Călăraşi'),
    ('RO313', 'Dâmboviţa'),
    ('RO314', 'Giurgiu'),
    ('RO315', 'Ialomiţa'),
    ('RO316', 'Prahova'),
    ('RO317', 'Teleorman'),
    ('RO321', 'Bucureşti'),
    ('RO322', 'Ilfov'),
    ('RO411', 'Dolj'),
    ('RO412', 'Gorj'),
    ('RO413', 'Mehedinţi'),
    ('RO414', 'Olt'),
    ('RO415', 'Vâlcea'),
    ('RO421', 'Arad'),
    ('RO422', 'Caraş-Severin'),
    ('RO423', 'Hunedoara'),
    ('RO424', 'Timiş')
)
INSERT INTO "Jurisdiction" (id, "countryCode", "subdivisionCode", name, level, "parentJurisdictionId", "contentStatus")
SELECT md5('nexsteps-ro-county:' || counties.code)::uuid::text,
       'RO', counties.code, counties.name, 'REGION', romania.id, 'NOT_CONFIGURED'
FROM counties CROSS JOIN romania
WHERE NOT EXISTS (
  SELECT 1 FROM "Jurisdiction" existing
  WHERE existing."countryCode" = 'RO' AND existing."subdivisionCode" = counties.code
);
