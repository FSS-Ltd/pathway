# Whole-program coverage audit

Audit baseline: 20 October 2026, after [Sweden PR #699](https://github.com/FSS-Ltd/pathway/pull/699) merged at `d3937f1d452a2e6d64dc8056b794436e9667849b`.
Runtime catalogue: `1.32.0`. This is a gap inventory and acceptance ledger, **not**
a finding of full legal coverage or certification. Recalculate the figures from
the current catalogue and CSV before relying on them after a later change.

## Reproducible structural findings

| Check                     | Observed evidence                                                                                | Result                                                                                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Agreed country packs      | 31 entries in `jurisdictions.csv`: four UK nations and all 27 EU states                          | National partial cores published in catalogue 1.32.0                                                                                                        |
| Sector/topic matrix       | 918 rows × eight topics in `coverage.csv`; six sectors per jurisdiction                          | 7,344 explicit cells across 153 jurisdiction keys                                                                                                           |
| National cells            | 31 × six sectors × eight topics                                                                  | All 1,488 `PARTIALLY_PUBLISHED`; zero fully published                                                                                                       |
| Subdivision cells         | 122 keys in Portugal (20), Romania (42), Slovakia (8), Slovenia (12), Spain (19) and Sweden (21) | 732 `PARTIALLY_PUBLISHED`; 5,124 `IN_REVIEW`                                                                                                                |
| Regional review inventory | `jurisdictions.csv`                                                                              | 27 `IN_REVIEW`; England, Scotland, Northern Ireland and Ireland `NOT_REVIEWED`                                                                              |
| Runtime content           | Schema-validated `TRACKER_CATALOGUE`                                                             | 862 reviewed source records; 859 published requirement records (294 statutory duties, 17 statutory guidance, 487 recommendations, 61 provider requirements) |
| Review dates              | Compared current source and requirement review-due dates with 2026-10-20                         | None overdue on that date; this does not establish legal completeness or future currency                                                                    |

Every runtime coverage cell also has `regionalStatus=IN_REVIEW`. A published
national action is therefore not evidence that the site's whole regulatory scope
has been assessed. A county, district or region selector is not a municipal legal
review; a generic “check with your authority” action does not discharge the
underlying local duties.

The structural counts were checked by parsing `coverage.csv` and
`jurisdictions.csv` with Python's `csv` module and importing
`TRACKER_CATALOGUE` with the repository's `tsx` binary. The CSV and runtime
coverage counts agree at 7,344. Structural agreement cannot establish that an
action correctly interprets its cited provision.

## Requirement-by-requirement completion gates

The following gates apply to **every** jurisdiction, sector, topic and relevant
subdivision. Evidence must be recorded in that pack's review and applicability
fixtures. A cell can be closed as `PUBLISHED` only when no unassessed applicable
scope remains, or as `REVIEWED_NO_REQUIREMENTS` only with a source-backed reason.

| Gate                                       | Evidence needed for sign-off                                                                                                                                                                           | Current disposition                                                                             |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Authority and legal classification         | Current primary law/regulator/provider source, precise provision, operative date, territory, obligation class and translated-text provenance where needed                                              | Partial national entry actions exist; item-level final review remains                           |
| Actual provider and activity applicability | Positive, negative and unresolved fixtures for school/legal status independent of ACE, ages, hours, funding, childcare, staff roles, premises, food, transport, trips, boarding and ICCE participation | Selected fixtures exist per pack; exhaustive combinations unproven                              |
| Territorial implementation                 | National, devolved, regional and municipal authorities identified; local duties reviewed or explicit sourced reason that none apply                                                                    | Open in every pack; four inventories not reviewed at all                                        |
| Evidence and lifecycle                     | Actionable evidence expectation, review dates, change/supersession behaviour, N/A policy and explicit unknown treatment                                                                                | Schema and tracker support these; each action still requires legal and scenario review          |
| Runtime boundaries                         | Checklist selection, partial-coverage display, manual persistence, signal privacy, tenant isolation and access control exercised for affected changes                                                  | Prior feature and pack tests exist; final cross-pack regression and live-flow inspection remain |
| Delivery gate                              | Local verification, latest-head required CI, host-confirmed merge and progress evidence for every remediation step                                                                                     | Sweden gate satisfied; later work remains                                                       |

## Open territorial work

The [country inventory](jurisdictions.csv) and individual
[pack reviews](packs) are the starting records, not completed regional analysis.
The four `NOT_REVIEWED` inventories (England, Scotland, Northern Ireland and
Ireland) need a competent-authority and subdivision inventory first. The other
27 inventories need their listed regional and local legal decisions resolved.
Only six countries currently have explicit subdivision rows in the matrix; their
5,124 `IN_REVIEW` cells and unseeded municipal scope remain open. For the other
25 national packs, an absent regional row must not be read as a finding that no
regional duty exists.

Prioritise remediation by the competent regulator and actual provision, starting
with education/childcare registration and safeguarding, then staff eligibility,
premises and conditional activities. Share EU-wide law only where it genuinely
applies; each member state's implementation still needs its own review. Each
remediation unit must identify the exact cells and requirement versions it closes,
update the source and fixture record, and pass the repository's one-PR-at-a-time
delivery gate. Keep unresolved coverage visible in the portal throughout.

**Full-coverage sign-off is withheld.** The 31 country packs satisfy the ordered
publication milestone, but the explicit regional, specialist and item-level gates
above remain open. The final pass must revisit this ledger after those gaps are
closed and verify the actual current state before declaring completion.
