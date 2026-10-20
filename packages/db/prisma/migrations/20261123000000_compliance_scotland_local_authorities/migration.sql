-- Scottish council areas from ONS April 2025 county/unitary names and codes.
-- https://www.data.gov.uk/dataset/1c611b98-7872-47ea-a3f6-71488ab22374/county-and-unitary-authority-april-2025-names-and-codes-in-the-uk
-- Geography selectors only; council-specific duties remain IN_REVIEW.
WITH scotland AS (
  SELECT id FROM "Jurisdiction" WHERE "subdivisionCode" = 'GB-SCT' AND level = 'NATION' ORDER BY id LIMIT 1
), councils(code, name) AS (
  VALUES
    ('S12000005', 'Clackmannanshire'),
    ('S12000006', 'Dumfries and Galloway'),
    ('S12000008', 'East Ayrshire'),
    ('S12000010', 'East Lothian'),
    ('S12000011', 'East Renfrewshire'),
    ('S12000013', 'Na h-Eileanan Siar'),
    ('S12000014', 'Falkirk'),
    ('S12000017', 'Highland'),
    ('S12000018', 'Inverclyde'),
    ('S12000019', 'Midlothian'),
    ('S12000020', 'Moray'),
    ('S12000021', 'North Ayrshire'),
    ('S12000023', 'Orkney Islands'),
    ('S12000026', 'Scottish Borders'),
    ('S12000027', 'Shetland Islands'),
    ('S12000028', 'South Ayrshire'),
    ('S12000029', 'South Lanarkshire'),
    ('S12000030', 'Stirling'),
    ('S12000033', 'Aberdeen City'),
    ('S12000034', 'Aberdeenshire'),
    ('S12000035', 'Argyll and Bute'),
    ('S12000036', 'City of Edinburgh'),
    ('S12000038', 'Renfrewshire'),
    ('S12000039', 'West Dunbartonshire'),
    ('S12000040', 'West Lothian'),
    ('S12000041', 'Angus'),
    ('S12000042', 'Dundee City'),
    ('S12000045', 'East Dunbartonshire'),
    ('S12000047', 'Fife'),
    ('S12000048', 'Perth and Kinross'),
    ('S12000049', 'Glasgow City'),
    ('S12000050', 'North Lanarkshire')
)
INSERT INTO "Jurisdiction" (id, "countryCode", "subdivisionCode", name, level, "parentJurisdictionId", "contentStatus")
SELECT md5('nexsteps-scotland-council:' || councils.code)::uuid::text,
       'GB', 'GB-SCT-' || councils.code, councils.name, 'LOCAL_AUTHORITY', scotland.id, 'NOT_CONFIGURED'
FROM councils CROSS JOIN scotland
WHERE NOT EXISTS (
  SELECT 1 FROM "Jurisdiction" existing
  WHERE existing."countryCode" = 'GB' AND existing."subdivisionCode" = 'GB-SCT-' || councils.code
);
