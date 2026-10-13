# Research catalogue contract

Catalogue specification revision: **1**. No reviewed requirements are published by
step 1.1. This is the content/review contract for subsequent implementation and
jurisdiction-pack steps, not a runtime schema or legal certification.

## Research procedure

1. Classify actual provision and applicable authorities before drafting actions.
   Investigate all six sectors and all eight topics in [COVERAGE.md](COVERAGE.md).
2. Use current legislation, regulators and qualification-provider publications.
   Use Eurydice/FRA to discover and cross-check national authorities, then read the
   underlying national/regional sources. Preserve original-language provisions;
   record translation origin and uncertainty. Do not promote a summary to law.
3. Separate statutory duties, statutory guidance, recommendations and provider
   requirements. Record enabling law where guidance interprets it. Distinguish
   publication/update dates from commencement dates and future changes.
4. Draft an actionable item with evidence expectations, precise territorial and
   provider/activity conditions, and an explanation of why it applies. Do not make
   adult/parent account status a check-eligibility test.
5. Review sources and applicability together. Include positive, negative and
   unresolved fixtures; specifically test territorial boundaries, age/provision
   thresholds, conditional activities, funding and legal status independent of ACE.
6. Record reviewer identity, reviewed revision, verification date and next review.
   Only publish reviewed cells/versions. Superseded, stale, withdrawn, unavailable
   and unresolved coverage remain explicit and preserve historical references.

## Required record fields

| Record              | Fields to capture before publication                                                                                                                                                                                                                                                                                                                            |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Catalogue/pack      | Stable ID; schema revision; content version; jurisdiction and parent IDs; applicable regional subdivisions; sector/topic coverage; state; release date; superseded version                                                                                                                                                                                      |
| Source              | Stable ID; exact URL; title; issuing authority; original language; legislation/guidance/provider classification; provision/article/paragraph; territorial scope; publication/update date; effective-from/to (or explicit unknown with reason); retrieved date; verified date; verifier; review-due date; source-review state; translation provenance where used |
| Requirement version | Stable requirement ID; immutable version; action; topic; obligation class; source IDs and specific provisions; territorial scope; applicability conditions and unknown-input explanation; evidence expectations; permitted N/A conditions; review cadence and basis; effective dates; material-change reason; supersedes reference                              |
| Coverage cell       | Jurisdiction/subdivision × sector × topic; status; reviewed pack version; sources/review record; relevant regional inventory; gap or reviewed-no-requirements rationale                                                                                                                                                                                         |
| Review/fixtures     | Reviewer/date/revision; source validity and interpretation checks; profile inputs; expected applicable/not-applicable/unresolved outcome and explanation; boundary cases; unresolved issues; publication decision                                                                                                                                               |

Dates must be ISO 8601. Unknown dates are explicit unknowns, not invented values.
Never use a retrieved date as evidence that a source has been legally reviewed.
Source-review timing should reuse the existing regulatory review conventions;
justify any different window and record source-driven earlier reviews.

## Topic inventory

| ID                      | Research questions and evidence expectations                                                                                                                                  |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| registration_governance | Classification, registration, permissions, inspections, responsible people, complaints and notifications; registration decisions, policy ownership and inspection records     |
| safeguarding            | Policies, designated roles, reporting, recruitment safeguards, training and recordkeeping; current policy, appointments and reporting procedures                              |
| personnel               | Role-eligible checks, qualifications, first aid, safeguarding training and review dates; scheme/level, issue and verification details, training evidence and review rationale |
| privacy_records         | Lawful processing, privacy information, sensitive data, retention, rights, breaches and conditional DPIA/DPO; processing/retention records and applicable assessments         |
| premises_safety         | Risk assessments, fire, first aid, medical needs, accessibility and incident procedures; assessments, plans, inspections and review records                                   |
| education_childcare     | Curriculum, attendance, admissions, ratios, additional needs, parent information and assessment where applicable; provision-specific records and registrations                |
| activities              | Food, transport, trips, boarding and other provided activities; activity-specific approvals, risk assessments and permissions                                                 |
| ace_icce                | Conditional provider registration, training, enrolment, approved projections, moderation and renewal; provider evidence and external decisions, never inferred approval       |

## Versioning and unresolved coverage

Stable requirement IDs survive wording changes; published versions are immutable.
Material changes to duties, applicability or profile require renewed confirmation.
Keep attestations linked to the exact historical version/profile. Withdrawal stops
new use but does not delete evidence or historical completion records.

A reviewed empty cell needs a documented source-backed reason and review metadata.
An absent, unreviewed, stale or unavailable cell is a gap, not an empty checklist.
National review cannot hide unassessed regional rules. Publication records identify
exact cells covered and remaining gaps. A shared EU source cannot mark a member
state's implementation reviewed. Activity conditions remain visible even when the
corresponding portal module is not purchased.

This structure reuses the concepts in the existing
[Nexsteps Home regulations reference](../nexsteps-home/regulations-and-evidence.md)
and the `Jurisdiction`, `RegulatorySource` and `RequirementVersion` models. Keep
institutional assignments/evidence distinct from household/child records.
