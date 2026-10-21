# Ireland local-authority inventory in progress

Checked 20 October 2026. This is a territorial inventory, not a review of
individual council planning, fire, food, premises, transport, childcare or
other decisions. The national checklist remains partially published; every new
local-authority sector/topic cell remains `IN_REVIEW`.

The [Department of Housing, Local Government and Heritage](https://www.gov.ie/en/department-of-housing-local-government-and-heritage/organisation-information/local-government-structure-and-functions/)
identifies **31 local authorities**: 26 county councils, three city councils,
and two city and county councils. The [Tailte Éireann 2024 National Statutory
Boundary dataset](https://data.gov.ie/en_GB/dataset/local-authorities-national-statutory-boundaries-ungeneralised-2024)
contains 31 distinct `BDY_ID` values. The catalogue uses `IE-LA-` plus each
source `BDY_ID` as its internal jurisdiction key. The migration uses the same
identifiers and readable authority names; source names were compared without
case or accent differences. Boundary data has multiple geometry rows per
authority, so the source was deduplicated by `BDY_ID` before use.

Local councils are not the only competent authorities. [Tusla's early-years
register](https://www.tusla.ie/services/preschool-services/general-information/register-of-early-years-services-by-county/)
and [inspection contacts](https://www.tusla.ie/get-in-touch/early-years-inspectors/)
are organised by county/service. Tusla's [2024 adequacy
report](https://www.tusla.ie/uploads/content/Review_of_Adequacy_Report_2024_Final_01_08_2025.pdf)
describes 17 child and family service areas in six regions. These are not
interchangeable with the 31 council areas. Actual education, safeguarding,
childcare, food and fire routes must be established for the site's provision
and address. A council selection does not certify which separate regulator or
service office is responsible.

The next pass must review topic-specific local controls and the separate Tusla
and specialist geographies before any local cell is published. Missing local
authority information remains unresolved in the tracker.
