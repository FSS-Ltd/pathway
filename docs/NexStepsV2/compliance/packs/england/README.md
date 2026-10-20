# England pack: reviewed national core

Step **2.01 remains partially published**. The merged release contains catalogue **1.2.0** with
**154 reviewed source records and 106 current actions** across eight topics and all six
institutional research sectors. It is not a complete England pack or legal
certification. The initial v1.1 core passed its gate and was merged in PR #634. The v1.2 follow-up passed all eight CI checks, merged in PR #657 and was deployed and checked live on 17 October 2026.
Catalogue 1.33.0 adds [local-authority selectors](local-authority-inventory.md)
without publishing council-specific duties.

## Publication and coverage

All 48 England national jurisdiction/sector/topic cells are
`PARTIALLY_PUBLISHED`. The 15,216 English upper-tier and distinct-district
cells added in catalogue 1.33.0 are `IN_REVIEW`. A partial cell can expose individually
published, reviewed actions while continuing to count as a coverage gap. No cell
is marked `REVIEWED_NO_REQUIREMENTS`. The source review expires 12 January 2027;
expired, withdrawn or future requirements must not remain available for current
confirmation. Historical records remain retained.

The runtime catalogue's topic-specific gap descriptions are the publication
boundary. Reviewed additions include maintained/academy governance, curriculum, admissions
and SEND assessment routes; childcare registers/funded places; advanced privacy;
and premises/activity responsibilities. Remaining work includes granular school
constitution/appeal/exemption rules, provider-specific register/funding conditions,
record-specific education privacy rights, specialist premises/activity regimes,
local safeguarding arrangements and permissions, and actual ACE institutional
agreements. No list of all council policies has
been reviewed. Region entry alone does not establish reviewed local coverage.

The merged bounded release establishes its own delivery gate, not completion of
the entire jurisdiction scope. The user explicitly requested progression to the
remaining packs after the verified #657 release. Wales proceeds next while these
England local and specialist gaps remain visible; neither jurisdiction coverage
nor the overall project is declared complete.

## Actual provision and unknown facts

ACE, selected screens, funding and legal provider category remain separate.
The school predicates use declared provider category and actual English school
category. Churches, charities, clubs and learning centres operating a school get
school duties. Nursery remains a research category mapped from its existing
vertical; that screen does not establish legal exemptions.

Eight additive facts are optional for old clients and stored profiles: controller
role, employment, premises control, food-business classification, own vehicle
operation, English school category, EYFS scope and assessed English school
medical-duty scope. Omissions normalize to unknown. No-op saves of pre-upgrade
JSON preserve timestamps and revision history. New facts do not come from billing,
portal account type, screen selection or age-based assumptions.

The section 100 fact requires an actual legal assessment. September 2026 allergy
policy duties apply to the specified English schools; maintained nursery schools,
young-child provision and 16–19 academies have exclusions. Independent-school
first aid has its own ISS basis. Forthcoming blanket training/spare-AAI regulations
must not be presented as current duties.

## Source dates and decisions

See [source-review.md](source-review.md), [education research](education-research.md),
[safeguarding research](safeguarding-research.md), [privacy research](privacy-research.md)
and [operations research](operations-research.md). Further reviewed detail is in
[state-school research](state-school-research.md), [advanced privacy](privacy-advanced-research.md),
[operational detail](operational-detail-research.md) and [childcare routes](childcare-routes-research.md). Current official law XML was
used when the browser reader could not render legislation XHTML. Made/Royal Assent,
publication, amendment commencement and source-observation dates are distinct.

`effective.currentAsOf` records an independently reviewed current text when exact
commencement/application dates remain unknown; it is not an invented commencement.
An unknown `from` still requires a reason. Observation must not postdate retrieval
or review, and known future starts always block early selection. Current provider
text does not prove a particular entity's external approval or regional agreement.

ICCE duties depend on actual ICCE participation, not ACE or a school screen. Signals
support external registration/training/projection/moderation checks without granting
approval. Role-eligible checks are assessed individually; parents/adult accounts do
not automatically need DBS, and certificates have no official expiry date.

## Verification record

Focused applicability/source/engine/fact checks passed **74 tests in five suites**.
They cover cross-sector school status, England-only selection, UK nation boundaries,
conditional ICCE, controller/medical unknowns, review expiry, partial coverage and
manual completion. Earlier zero-catalogue assertions were updated to exercise the
published core and explicit gaps; synthetic engine fixtures remain independent.
Final integration passed 101 suites / 617 tests. Workspace type/lint, admin units,
Prisma/permission checks, API/admin/web builds and independent source/backend/UI
review passed. An earlier run had two existing HTTP failures; unchanged focused and
full isolated reruns passed, with the earlier results retained in the ledger.
Commit hooks passed 226 API suites / 1,630 tests for the initial core.
The expanded catalogue passed current-head host CI and merged in PR #657. See the project
[progress ledger](../../PROGRESS.md) for exact commands and current results.

## Published history and renewed confirmation

Catalogue 1.1 remains unchanged. Version 1.2 retains 108 requirement revisions for
106 current actions; transport/boarding updates require version-2 confirmation,
with old confirmations retained as history. New actions are effective from the
17 October release. Source observation dates remain their actual 15 October
verification dates. Existing general curriculum-route assessment is retained.
