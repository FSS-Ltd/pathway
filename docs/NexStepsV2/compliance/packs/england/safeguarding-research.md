# England safeguarding, personnel and ACE/ICCE research

Research revision 1; researched by Codex (England safeguarding delegate),
retrieved and source/applicability checked **2026-10-15**; next source review
**2027-01-13** (90 days), earlier following a source change. This research note is
input to the pack review; it does not itself publish a coverage cell or represent
external approval. Original language: English; no translation used.

## Profile interpretation and boundaries

Research groups are SCHOOL, NURSERY, CHURCH, CHARITY, CLUB and LEARNING_CENTRE.
NURSERY is represented in product storage by a school vertical, not a new sector.
Apply duties to actual provision. School rules can apply to a church or learning
centre that legally operates a school. ACE participation never establishes that
status. Public Learning Centre does not establish public funding.

Suggested predicates, all additionally requiring country GB and nation GB-ENG:

- `school`: providerCategory INDEPENDENT_SCHOOL or STATE_SCHOOL.
- `earlyYearsCandidate`: providerCategory EARLY_YEARS, or childcare=true and
  minimumAge<=5. This identifies a classification review, not proof of EYFS scope.
- `children`: minimumAge<=17. Unknown minimumAge remains unresolved; maximumAge
  alone cannot establish absence of children.
- `outOfSchool`: providerCategory OUT_OF_SCHOOL and children.
- `charity`: charitable=true. Sector CHARITY should prompt confirmation of the
  legal fact rather than silently setting it.
- `icce`: icce=true, independently of ace or chosen vertical.

The current condition schema can express these with `all`, `any`, `eq` and `lte`.
It cannot express individual duties/frequency/supervision, registration exemptions,
DBS workforce eligibility, whether a relevant agency has been named locally,
charitable regulator/exemption, or ICCE regional agreement terms. Checklist
assessment actions can require these facts as evidence; do not encode their
outcomes as a false certainty. Unknown jurisdiction must never fall back to England.

## Current school safeguarding guidance

**S1 — Department for Education, statutory guidance:**
[Keeping children safe in education 2026](https://www.gov.uk/government/publications/keeping-children-safe-in-education--2),
[current PDF](https://assets.publishing.service.gov.uk/media/6ac3c09c11ed58342ad8e4ac/Keeping_children_safe_in_education_2026.pdf).
England; published for information 2026-07-07; effective 2026-09-01; no end date
specified. Enabling provisions identified by the guidance include Education Act
2002 s175 and Education (Independent School Standards) Regulations 2014.

For `school`, use these separately confirmable actions (statutory guidance;
individual mandatory recruitment rules depend on role):

| Action                                                                                                                                 | Provision                    | Expected evidence                |
| -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | -------------------------------- |
| Review child protection and staff-conduct policies, including child-on-child abuse and reporting                                       | Part 2, paras123–125         | Approved policies; annual review |
| Appoint a senior DSL with authority, resources and cover                                                                               | Part 2; Annex B              | Appointment and role description |
| Deliver induction and annual safeguarding updates; renew DSL training at least every two years                                         | paras153–154; Annex B        | Training register and dates      |
| Verify identity, references, eligible checks, qualifications, work entitlement and relevant overseas history before appointment        | Part 3, paras302–313,359–363 | Recruitment checklist            |
| Maintain the single central record and role-specific prohibition/management checks                                                     | paras347–357                 | Dated register; verifier         |
| Maintain confidential concerns, allegations and referral procedures; transfer protection files securely within stated five-day windows | Parts1,4; para150; Annex B   | Restricted records; receipt      |
| Review filtering/monitoring effectiveness annually                                                                                     | paras173–177                 | Review and device checks         |

Do not treat all “should” provisions as freestanding statutory duties. The landing
page asks all staff to read Part1; the PDF introduction retains different wording
for staff not working directly with children. Full Part1 acknowledgement is the
conservative operational action; record this source discrepancy during review.

## Early years safeguarding and personnel

**S2 — Department for Education, mandatory statutory framework:**
[EYFS publication page](https://www.gov.uk/government/publications/early-years-foundation-stage-framework--2),
[group and school-based framework](https://assets.publishing.service.gov.uk/media/6a5f8e4fb00f3323bf1a23a1/EYFS_group_and_school_based_from_September_2026.pdf).
England; information release 2026-07-13; effective 2026-09-01; end unspecified.
Childcare Act 2006 and EYFS Welfare Requirements Regulations 2012 underpin scope.
Confirm registration/exemption and provider type before treating an
`earlyYearsCandidate` as covered. Childminders have a separate framework.

| Action                                                                                               | Provision           | Expected evidence                           |
| ---------------------------------------------------------------------------------------------------- | ------------------- | ------------------------------------------- |
| Designate safeguarding lead; implement policies, devices rules and whistleblowing                    | 3.4–3.8             | Appointments; policies                      |
| Maintain immediate social-care/emergency reporting and required Ofsted/CMA notifications             | 3.9–3.10            | Local contacts; notification log            |
| Verify suitability, eligible enhanced/barred-list checks, qualifications and disqualification status | 3.13–3.27           | Role/premises assessment; verified register |
| Obtain at least one written reference before recruitment, including students/volunteers              | 3.20–3.21           | Verified reference                          |
| Train practitioners and DSL against Annex C; renew training every two years                          | 3.31–3.33; Annex C  | Content and certificates                    |
| Arrange staff supervision and sufficient competent staffing                                          | 3.35–3.36;3.43–3.58 | Supervision; qualification/ratio assessment |
| Ensure current full paediatric first-aid coverage on premises and outings; renew every three years   | 3.37–3.40; Annex A  | Certificates; coverage rota                 |

Ratio counting depends on qualification date, route, staff age and provider type;
record the assessment rather than assuming any training certificate is sufficient.

## Community, faith, clubs and supplementary learning

**S3 — Department for Education, statutory guidance:**
[Working Together to Safeguard Children 2026](https://www.gov.uk/government/publications/working-together-to-safeguard-children--2),
[PDF](https://assets.publishing.service.gov.uk/media/69b995106736ec37c8a4669f/Working_together_to_safeguard_children_2026_.pdf).
England; published/current replacement 2026-03-18. Effective-from unknown: publication
identifies replacement of 2023 but gives no separate commencement date. No end date.

Chapter4 paras354–360 addresses VCSE, faith, private providers and sport; Chapter2
paras74,86–88 addresses local arrangements. For `children`, assess and implement
appropriate safeguarding responsibilities, trained practitioners, policies and local
referral/escalation routes. Retain the policy, training and local contact review.
Where named as a relevant agency in local arrangements, establish and meet the duty
to cooperate. Evidence: local published arrangement and naming decision, responsibilities,
information-sharing/referral procedures. A local-authority name in the profile alone
does not prove that naming decision. Statutory guidance status does not make every
private provider a Children Act s11 body. Local processes remain location-specific.

**S4 — Department for Education, non-statutory recommendations:**
[Out-of-school settings guidance](https://www.gov.uk/government/publications/keeping-children-safe-in-out-of-school-settings-code-of-practice),
[February 2026 PDF](https://assets.publishing.service.gov.uk/media/6986066acfe7ccf77efbc75b/After-school_clubs__community_activities__and_tuition_-_Safeguarding_guidance_for_providers.pdf).
England; landing updated 2026-02-09; PDF history 2026-02-02. No legal commencement
for recommendations; effective date unknown/not statutory commencement.

For `outOfSchool`, independently confirm: written child-protection policy reviewed
annually/after incidents; trained safeguarding lead; child/family concerns and
staff-allegations routes; staff conduct and whistleblowing arrangements; checked
identity/references/role skills and eligible DBS level; training/refresher records;
first-aid needs and coverage. Evidence: dated policies, named contacts, recruitment
and training register, first-aid assessment/certificates. Provisions: sections2–4,
printed pp12–34. Lone providers remain responsible for their arrangements.

Guidance scope excludes schools, colleges, registered alternative provision and
Ofsted/CMA-registered childcare. Do not equate all non-school settings with this
scope. Its “must” summaries refer to conditional underlying law; never publish an
unqualified blanket paediatric-first-aid statute from this non-statutory document.

## DBS eligibility, validity and referral

**S5 — Disclosure and Barring Service, regulator guidance:**
[Regulated activity with children](https://www.gov.uk/government/publications/dbs-guidance-leaflets/regulated-activity-with-children).
Updated 2026-09-17; applicable to England (also listed other territories, not a
Scottish/NI rule). Legal basis: Safeguarding Vulnerable Groups Act 2006 as amended.
Effective-from unknown: update date is not commencement of every underlying rule.

Across all six sectors, assess each actual role/activity, frequency, supervision and
establishment before requesting the permitted check. Paid/unpaid status alone does
not determine eligibility. Section3 distinguishes repeated instruction/care from
health/personal care where a single occasion can qualify; section4 addresses specified
establishments. Evidence: written role eligibility decision, level/workforce/barred-list
basis and verifier. An adult/parent portal account creates no DBS requirement.
A check assessment action may apply even when its result is “not eligible”.

**S6 — DBS, regulator guidance:**
[Employer check guidance](https://www.gov.uk/guidance/dbs-check-requests-guidance-for-employers),
“Duration of criminal record check validity” and “Accepting a previously-issued DBS
check”. Publication/underlying commencement dates not established in this review;
current content checked 2026-10-15. No official certificate expiry. Keep issue date,
organisation review date/reason and any Update Service checks distinct. Verify
level/workforce and lawful consent/access rather than copying a certificate expiry.
Evidence: date/verification metadata and documented decision; minimise criminal data.

**S7 — DBS, legal-duty explanation:**
[Referral and decision-making guide](https://www.gov.uk/government/publications/dbs-referral-and-barring-decision-making-process/dbs-referrals-guide-referral-and-decision-making-process).
England regulated-activity providers; underlying basis SVGA2006 s35. Exact commencement
not verified; effective date unknown. Establish a referral procedure where removal,
or proposed removal had the worker not left, and harm/risk statutory conditions
are met. Evidence: restricted referral decision and DBS receipt. Dismissal alone
must not trigger an unconditional automated conclusion. Routine checklist wording
should ask to establish and follow the procedure; incident details stay restricted.

## Charitable institutions

**S8 — Charity Commission, regulatory guidance interpreting trustee duties:**
[Safeguarding and protecting people](https://www.gov.uk/guidance/safeguarding-and-protecting-people-for-charities-and-trustees).
England and Wales; first published 2017-12-06; current update 2026-10-08. Exact
underlying duty commencement unknown; guidance update is not a commencement date.
For `charity`, take reasonable steps to prevent harm to everyone contacting the
charity, including adults. Independently confirm: safeguarding risk register and
accountability; suitable people/check eligibility; implemented public policies
reviewed annually and after serious incidents; concerns/referral and serious-incident
reporting decisions; safe online practice. Evidence: trustee oversight minutes,
reviewed policies, risk register, recruitment/training records and reporting rationale.
Provisions: “Manage the risks”, “Policies, procedures and practices”, “Safeguarding
children or adults at risk”, “Handle and report incidents and concerns”. Do not
substitute a charity report for police/social-care reporting. Assess exempt/excepted
charities and principal regulators separately. Faith label alone does not establish
registration with the Commission.

## Conditional ICCE provider requirements

All following are **provider requirements**, not statutory duties. Authority:
International Certificate of Christian Education. Territory: ICCE participants in
England, with European/regional procedures where applicable. Each web source has
no displayed issue/effective date: record effective-from **unknown — provider page
undated** and end unspecified. Verified 2026-10-15, review 2027-01-13.
Apply `icce=true` across sectors; `icce=null` unresolved and `icce=false` excluded.
Do not make ICCE depend on `ace=true` or SCHOOL sector.

| Source and exact provision                                                                                            | Separate action and expected evidence                                                                                                                                                                                                                                          |
| --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [School/HEA registration](https://www.icce.education/school-hea-registration), “Becoming…” / “Maintaining…”           | Establish current ICCE registration, applicable local education registration, application/training/quality visit and unique entity ID. Retain external decision; plan renewal assessment after initial five-year full registration and maintain standards/records/site visits. |
| [Training](https://www.icce.education/training), “Initial/Ongoing” and “Professional Development”                     | Ensure coordinators/moderators pass Procedures & QA training before registration and markers receive training. Record prescribed annual 10-hour CPD and regional refresher requirements.                                                                                       |
| [Training overview](https://www.icce.education/files/ICCE%20Training%20Overview.pdf), Procedures & QA row             | Check recurrence at least every five years against regional terms; record actual course, approval and renewal date. Do not claim five years overrides a shorter regional requirement.                                                                                          |
| [Enrolling students](https://www.icce.education/enrolling-students), “Enrolment process/Academic projections/Ongoing” | Enrol through registered entity coordinator for each certificate; retain student ID, enrolment and ICCE-approved projection before certificate work. Portal projections alone are insufficient.                                                                                |
| [Course structure](https://www.icce.education/course-structure), introduction                                         | Check current Europe certificate structure when preparing projection; retain structure revision and registrar approval.                                                                                                                                                        |
| [Assessment](https://www.icce.education/assessment), “Quality Assurance”                                              | Appoint trained key roles; maintain secure assessment/marking procedures and visit evidence.                                                                                                                                                                                   |
| [Moderation](https://www.icce.education/moderation-1), “Identifying/Internal/External”                                | Use ICCE-approved trained moderator linked to entity; moderate randomly selected original tests (one per six/two per twelve), address deviations and submit anonymised coursework/moderated tests for external moderation using student ID. Retain moderation decisions.       |
| [Registration status](https://www.icce.education/registration-status)                                                 | Track actual external status, remediation deadlines and restrictions; retain correspondence. Full, pending, paused and provisional are distinct. Never convert a portal signal into external approval.                                                                         |

## Publication limits and fixtures

- ACE-only provider training/registration terms are **not fully reviewed**. CEE
  [schools page](https://www.christian.education/schools) establishes support for
  schools/learning centres but does not expose a full current agreement. Its
  [additional-campus fee page](https://shop.christian.education/products/additional-campus-annual-fee)
  references a signed multi-campus agreement. Do not import US ACE training cycles
  from an old newsletter, or TEACH household terms, into England institutional law.
  ACE=true/ICCE=false needs visible provider-terms coverage gap and an action to
  obtain its applicable current agreement; not a fabricated reviewed-empty cell.
- Local safeguarding-partner arrangements, LADO/social-care contacts and individual
  denominational/sport-governing-body/funder conditions are not exhaustively reviewed.
  Show regional gap; require local-authority/contact assessment.
- Proposed positive fixture: ACE independent school with icce=true gets school
  safeguarding and ICCE requirements; icce=false removes only ICCE requirements.
- Non-ACE OUT_OF_SCHOOL Public Learning Centre with children receives OOS
  recommendations and role-eligibility assessment, not state-school duties.
- Charity/church/club running a registered school receives school requirements
  regardless of selected sector; adult-only charity retains trustee safeguarding.
- Missing ages/provider type/charitable/ICCE/location facts remain unresolved;
  early-years candidate without registration/exemption facts must not assert scope.
- Parent account only does not imply eligible DBS/barred-list checks; an actual
  unsupervised eligible child-work role requires the separate assessment.
- England items do not apply to Wales, Scotland or Northern Ireland by fallback.

Direct legislation.gov.uk requests for Education Act2002 s175, Independent School
Standards Schedule and SVGA2006 s35 returned browser internal errors in this review.
Their provisions are identified through current official guidance, but direct
consolidated-law verification remains required before claiming exhaustive legal
review. No unverified amendment/commencement is presented as established here.
