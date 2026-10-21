-- Tailte Éireann 2024 National Statutory Boundary BDY_ID values for 31 Irish local authorities.
-- https://data.gov.ie/en_GB/dataset/local-authorities-national-statutory-boundaries-ungeneralised-2024
-- Geography selectors only; local-authority-specific duties remain IN_REVIEW.
WITH ireland AS (
  SELECT id FROM "Jurisdiction" WHERE "countryCode" = 'IE' AND level = 'COUNTRY' ORDER BY id LIMIT 1
), authorities(bdy_id, name) AS (
  VALUES
    ('15001', 'Carlow County Council'),
    ('25001', 'Cavan County Council'),
    ('35001', 'Clare County Council'),
    ('45501', 'Cork County Council'),
    ('45511', 'Cork City Council'),
    ('55001', 'Donegal County Council'),
    ('65001', 'Galway County Council'),
    ('65011', 'Galway City Council'),
    ('75001', 'Kerry County Council'),
    ('85001', 'Kildare County Council'),
    ('95001', 'Kilkenny County Council'),
    ('105001', 'Laois County Council'),
    ('115001', 'Leitrim County Council'),
    ('125002', 'Limerick City and County Council'),
    ('135001', 'Longford County Council'),
    ('145001', 'Louth County Council'),
    ('155001', 'Mayo County Council'),
    ('165001', 'Meath County Council'),
    ('175001', 'Monaghan County Council'),
    ('185001', 'Offaly County Council'),
    ('195001', 'Roscommon County Council'),
    ('205001', 'Sligo County Council'),
    ('215003', 'Tipperary County Council'),
    ('225002', 'Waterford City and County Council'),
    ('235001', 'Westmeath County Council'),
    ('245001', 'Wexford County Council'),
    ('255001', 'Wicklow County Council'),
    ('265001', 'Dún Laoghaire-Rathdown County Council'),
    ('265002', 'Fingal County Council'),
    ('265003', 'South Dublin County Council'),
    ('265011', 'Dublin City Council')
)
INSERT INTO "Jurisdiction" (id, "countryCode", "subdivisionCode", name, level, "parentJurisdictionId", "contentStatus")
SELECT md5('nexsteps-ireland-local-authority:' || authorities.bdy_id)::uuid::text,
       'IE', 'IE-LA-' || authorities.bdy_id, authorities.name, 'LOCAL_AUTHORITY', ireland.id, 'NOT_CONFIGURED'
FROM authorities CROSS JOIN ireland
WHERE NOT EXISTS (
  SELECT 1 FROM "Jurisdiction" existing
  WHERE existing."countryCode" = 'IE' AND existing."subdivisionCode" = 'IE-LA-' || authorities.bdy_id
);
