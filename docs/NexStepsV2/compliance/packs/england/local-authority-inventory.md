# England local-authority inventory in progress

Checked 20 October 2026. This is a territorial inventory, not a review of the
individual councils' policies, licences or safeguarding arrangements. England's
national sector/topic cells remain `PARTIALLY_PUBLISHED`; local legal content
remains in review.

The [ONS 2026 geography guide](https://www.ons.gov.uk/peoplepopulationandcommunity/wellbeing/methodologies/clusteringsimilarlocalauthoritiesandstatisticalnearestneighboursintheuk)
counts **153 upper-tier authorities** in England: 63 unitary authorities, 36
metropolitan districts, 33 London boroughs including the City of London, and 21
counties. It counts **296 lower-tier authorities**. The [ONS April 2025 lower-to-
upper lookup](https://www.data.gov.uk/dataset/d35ea01b-3d37-4cbb-a81d-126a503e7c07/local-authority-district-to-county-and-unitary-authority-april-2025-lookup-in-the-uk-v2)
contains 296 English districts: 132 unitary/metropolitan/London authorities that
are also upper-tier authorities, and 164 districts within 21 counties. Its 153
distinct upper-tier codes match the [ONS county/unitary code list](https://www.data.gov.uk/dataset/1c611b98-7872-47ea-a3f6-71488ab22374/county-and-unitary-authority-april-2025-names-and-codes-in-the-uk)
and the 2026 ONS guide. The two downloaded CSVs were compared by code and name;
there were no unmatched English upper-tier codes. These are **317 unique current
authorities** across the two tiers, not 449 independent local areas.

The 2025 code files are the latest directly retrieved official complete lists for
this mapping. The 2026 ONS guide corroborates their category counts. The
[government's 2026 local-government reorganisation updates](https://www.gov.uk/government/collections/local-government-reorganisation-policy-and-programme-updates)
and the [Surrey structural order](https://www.legislation.gov.uk/uksi/2026/264/article/4/made)
show why this list requires review: East and West Surrey do not replace current
authorities for statutory functions until **1 April 2027**. Do not select them as
current authorities or silently carry this inventory forward after reorganisation.

The two tiers are not interchangeable. The [government's council-function
guide](https://www.gov.uk/understand-how-your-council-works/types-of-council)
places education and social care with county councils in two-tier areas, while
district councils normally handle planning applications and other local services;
unitary, London and metropolitan councils combine the tiers. [Working Together
2026](https://www.gov.uk/government/publications/working-together-to-safeguard-children--2)
describes safeguarding arrangements by local authority area, which may cross
boundaries by agreement. Fire and rescue, police, health and safeguarding
partnership boundaries may differ from council boundaries. A postcode or
free-text council name cannot by itself establish the competent authority for
every topic. The site must record its actual location and provider category,
then verify the authority for each duty.

Catalogue 1.33.0 and the additive migration seed the 153 upper-tier and 164
distinct district selectors with their parent relationships. The catalogue
keeps all 15,216 new sector/topic cells `IN_REVIEW`. The schema's intermediate
`REGION` level represents an upper-tier council in this English hierarchy; the
site selector labels it as an upper-tier council, not as a statistical region.
Selecting a district resolves the district, upper-tier authority and England
national checklist in order. It does not publish council-specific duties solely
from these names and codes. Review current safeguarding partnership, LADO,
childcare, food, fire, planning and licensing decisions at the appropriate level
before closing a cell.
