-- Current local governments from the Central Statistical Bureau ATVK dataset:
-- https://data.gov.lv/dati/eng/dataset/atvk
-- Resource ATVK_2021_22082026; reviewed 2026-10-20.
-- The ATVK code identifies the competent local authority; municipal rules remain in review.
WITH latvia AS (
  SELECT id FROM "Jurisdiction" WHERE "countryCode" = 'LV' AND level = 'COUNTRY' ORDER BY id LIMIT 1
), authorities(code, name) AS (
  VALUES
    ('0001000', 'Rīga'),
    ('0002000', 'Daugavpils'),
    ('0003000', 'Jelgava'),
    ('0004000', 'Jūrmala'),
    ('0005000', 'Liepāja'),
    ('0006000', 'Rēzekne'),
    ('0007000', 'Ventspils'),
    ('0020000', 'Aizkraukles novads'),
    ('0021000', 'Alūksnes novads'),
    ('0022000', 'Augšdaugavas novads'),
    ('0023000', 'Ādažu novads'),
    ('0024000', 'Balvu novads'),
    ('0025000', 'Bauskas novads'),
    ('0026000', 'Cēsu novads'),
    ('0027000', 'Dienvidkurzemes novads'),
    ('0028000', 'Dobeles novads'),
    ('0029000', 'Gulbenes novads'),
    ('0030000', 'Jelgavas novads'),
    ('0031000', 'Jēkabpils novads'),
    ('0032000', 'Krāslavas novads'),
    ('0033000', 'Kuldīgas novads'),
    ('0034000', 'Ķekavas novads'),
    ('0035000', 'Limbažu novads'),
    ('0036000', 'Līvānu novads'),
    ('0037000', 'Ludzas novads'),
    ('0038001', 'Madonas novads'),
    ('0039000', 'Mārupes novads'),
    ('0040000', 'Ogres novads'),
    ('0041000', 'Olaines novads'),
    ('0042000', 'Preiļu novads'),
    ('0043000', 'Rēzeknes novads'),
    ('0044000', 'Ropažu novads'),
    ('0045000', 'Salaspils novads'),
    ('0046000', 'Saldus novads'),
    ('0047000', 'Saulkrastu novads'),
    ('0048000', 'Siguldas novads'),
    ('0049000', 'Smiltenes novads'),
    ('0051000', 'Talsu novads'),
    ('0052000', 'Tukuma novads'),
    ('0053000', 'Valkas novads'),
    ('0054000', 'Valmieras novads'),
    ('0056000', 'Ventspils novads')
)
INSERT INTO "Jurisdiction" (id, "countryCode", "subdivisionCode", name, level, "parentJurisdictionId", "contentStatus")
SELECT md5('nexsteps-lv-atvk:' || authorities.code)::uuid::text,
       'LV', 'LV-ATVK-' || authorities.code, authorities.name, 'LOCAL_AUTHORITY',
       latvia.id, 'NOT_CONFIGURED'
FROM authorities CROSS JOIN latvia
WHERE NOT EXISTS (
  SELECT 1 FROM "Jurisdiction" existing
  WHERE existing."countryCode" = 'LV' AND existing."subdivisionCode" = 'LV-ATVK-' || authorities.code
);
