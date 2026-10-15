# England pack: reviewed national core

Step **2.01 remains in progress**. This branch prepares catalogue **1.1.0** with
**62 reviewed source records and 68 actions** across eight topics and all six
institutional research sectors. It is not a complete England pack or legal
certification. It has not passed its PR/CI/merge gate and is not deployed.

## Publication and coverage

All 48 England jurisdiction/sector/topic cells are `PARTIALLY_PUBLISHED`; the
other 1,440 cells remain `NOT_REVIEWED`. A partial cell can expose individually
published, reviewed actions while continuing to count as a coverage gap. No cell
is marked `REVIEWED_NO_REQUIREMENTS`. The source review expires 12 January 2027;
expired, withdrawn or future requirements must not remain available for current
confirmation. Historical records remain retained.

The runtime catalogue's topic-specific gap descriptions are the publication
boundary. Remaining work includes detailed maintained-school/academy governance,
admissions, curriculum and SEND routes; childcare register/funding conditions;
local safeguarding arrangements and permissions; specialist premises/activity
regimes; advanced privacy/processor/transfer/biometric/online-service duties; and
actual ACE regional institutional agreements. No list of all council policies has
been reviewed. Region entry alone does not establish reviewed local coverage.

A merged bounded-release PR would establish only that release's delivery gate;
it must not be recorded as completion of the entire jurisdiction step. Wales
implementation must wait for the agreed England predecessor gate and completion
of its required scope. Remaining country packs are not scaffolded here.

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
and [operations research](operations-research.md). Current official law XML was
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
Commit-hook API units and current-head host CI/merge remain required before delivery. See the project
[progress ledger](../../PROGRESS.md) for exact commands and current results.
