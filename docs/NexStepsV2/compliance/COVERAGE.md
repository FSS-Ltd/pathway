# Coverage matrix

Version **1**, established 13 October 2026. All coverage is **NOT_REVIEWED**.
No jurisdiction has a published institutional compliance pack in this delivery.

[jurisdictions.csv](jurisdictions.csv) records the 31 ordered packs: four UK nations
and 27 EU member states. [coverage.csv](coverage.csv) records **186 rows** (31 × six
sectors), each with **eight topic status columns**, giving **1,488 explicit cells**.
This compact matrix is research tracking data, not runtime requirements.

## Dimensions

- Jurisdiction keys: GB-ENG, GB-WLS, GB-SCT, GB-NIR and the 27 ISO country codes.
  UK rows have country GB and distinct nation identifiers; never a generic UK
  fallback that silently chooses England. EU-wide sources are shared references,
  not a substitute 28th country pack.
- Research sectors: SCHOOL, NURSERY, CHURCH, CHARITY, CLUB, LEARNING_CENTRE. These
  are research groups, not a migration of the database enums. Nursery is currently
  a SCHOOL sector vertical; keep its research coverage distinct. School coverage
  must assess independent, ACE and state provision. Learning-centre coverage must
  assess ACE and Public types. ACE and ICCE remain conditional, separate facts.
- Topics are the eight IDs defined in [RESEARCH.md](RESEARCH.md). Every sector is
  assessed across every topic, including conditional activities and ACE/ICCE.
  No topic is presumed irrelevant merely from the sector label.

## Status vocabulary

| Status                   | Meaning                                                                                                  |
| ------------------------ | -------------------------------------------------------------------------------------------------------- |
| NOT_REVIEWED             | No completed source/applicability review; visible coverage gap                                           |
| IN_REVIEW                | Research/review in progress; not publishable                                                             |
| REVIEWED                 | Sources, applicability and fixtures approved for an identified version and scope                         |
| PUBLISHED                | Reviewed version released through its verified delivery step                                             |
| PARTIALLY_PUBLISHED      | Reviewed actions available; specific national/regional/specialist gaps remain and count as coverage gaps |
| REVIEWED_NO_REQUIREMENTS | Explicit reviewed, sourced reason for no requirements in this precise scope                              |
| STALE                    | Review window expired or source change needs assessment; visible gap                                     |
| UNAVAILABLE              | Applicable content cannot be supplied; reason recorded; visible gap                                      |
| WITHDRAWN                | Removed from current use; history retained; visible gap                                                  |

Changing a cell out of NOT_REVIEWED requires a linked pack/review record with the
metadata in RESEARCH.md. The bare CSV status is never sufficient publication evidence.

## Regional coverage

Every jurisdiction starts with `regional_review=NOT_REVIEWED`. The inventory column
is a research instruction, not a claim that subdivisions have been exhaustively
identified. Resolve regional/local requirements during that jurisdiction's pack
step, including education and childcare authorities that differ by provision.

Track relevant subdivisions as additional jurisdiction keys and coverage rows in
the same matrix, preserving the parent country's gaps until their scope is reviewed.
Belgium requires community/region distinctions, Germany Länder, Spain autonomous
communities/cities; other countries still require explicit regional assessment.
Use existing jurisdiction hierarchy IDs and verified subdivision identifiers.
Do not invent IDs or treat no inventory yet as no regional duties.

Publication must disclose precisely which sector/topic/subdivision cells are covered
and which remain unknown. A site missing a required regional field cannot silently
inherit a supposedly complete national checklist. Completion counts only applicable
published actions while displaying these coverage gaps independently.

Partial publication never establishes complete coverage. Only individually reviewed
requirements with current sources are selected. The cell must identify its remaining
gaps and retain a review record; regional scope and expiry remain separate checks.
