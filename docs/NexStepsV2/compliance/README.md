# Nexsteps Compliance and Learning Centres

Approved delivery scope, 13 October 2026. Current delivery evidence lives in
[PROGRESS.md](PROGRESS.md). This documentation is step **1.1**, not a published
compliance catalogue or an implemented tracker.

## Scope and product contract

Support schools, nurseries, churches, charities, clubs and learning centres across
England, Wales, Scotland, Northern Ireland and all 27 EU countries. Publish reviewed
jurisdiction packs progressively. Detailed tax, payroll, fundraising and corporate
financial compliance are outside v1. Household preparedness remains separate.

Learning centres have `LEARNING_CENTRE` sector and `ACE_LEARNING_CENTRE` or
`PUBLIC_LEARNING_CENTRE` vertical. Public means non-ACE/open to the public, not
state-funded. Explicit mappings reuse ACE School and State School components,
capabilities and assets respectively, while storage retains the learning-centre
identity. Reuse existing pricing and module policies; introduce no paid module.
Validate sector/type combinations on the server and preserve legacy checkout.

Legal school/provider status, funding, operating location and ACE/ICCE participation
are independent facts. Never derive them from screen selection, billing address or
a parent/adult account. An ACE independent school can need independent-school
duties and conditional ICCE requirements simultaneously. Registration classification
uses actual provision, ages and full-time education, not a marketing label.

## Adapt Oasis to Nexsteps

Use existing Nexsteps design tokens, components, permissions and layout. Oasis is a
feature reference; its broad staff access and non-tenant records must not be copied.

| Compliance navigation | Behaviour                                                                                                                  |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Overview & Tracker    | Site-specific manual actions, category completion and evidence gaps                                                        |
| Safeguarding          | Retain existing routes, access restrictions and concern handling                                                           |
| Checks & Training     | Role-appropriate DBS, PVG, AccessNI or local checks, training, verification details and review dates                       |
| Medical Information   | Adapt MedTab using child health records and existing editing paths; distinguish unknown from explicit none                 |
| User Agreements       | Versioned documents, adult assignments, in-portal acknowledgement, recorded signed copies and immutable acceptance history |

Guardian consents and trip permission slips remain separate. Certificates, verification
dates and organisational review dates are distinct; do not invent DBS expiry dates.

Use a compact overview, grouped checklist rows and an accessible details panel.
Each action shows applicability, authority/source, expected evidence, manual checkbox,
notes and applicable review date. Include desktop/mobile, keyboard and enlarged-text
layouts, loading, empty, error, pending-save, success and retry states.

## Site boundary and progress

The active site is the compliance boundary. Capture country, required nation/region/
local authority, sector, product type, registration/provider category, funding,
ages, provision pattern, childcare, charitable status, activities and ACE/ICCE use.
Missing location must never default to England. Unresolved classification remains
unknown and visible.

Show “12 of 20 applicable actions completed” using current manual confirmations of
applicable published requirement versions. Show category progress too. Unresolved
applicability, missing/unreviewed coverage, overdue reviews and live evidence gaps
remain separate indicators. An empty denominator says “No applicable items”, never
100%. This measures checklist completion, not legal certification.

Permitted N/A decisions require reasons; unconditional duties cannot be dismissed.
Preserve profile, requirement and attestation history. Material changes require
renewed confirmation, including changed applicability and superseded requirements.
Failed or concurrent saves must not falsely confirm completion.

## Architecture and security

- Keep reviewed requirements in versioned, schema-validated catalogue files served
  by NestJS. Reuse jurisdiction hierarchy and source-review conventions, not
  household requirement assignments. See [RESEARCH.md](RESEARCH.md).
- Add tenant-scoped Prisma records for profiles, attestations, institutional
  evidence, personnel checks/training and agreements. Existing learning evidence
  requires a child and is unsuitable for general institutional documents.
- Expose typed `/compliance` profile, checklist/progress, attestation, signal,
  register, medical and agreement APIs. Resolve tenant and actor from authenticated
  context. Validate input, preserve RLS, encryption, private storage, auditing and
  retention/export mechanisms. Use additive migrations and preserve history.
- Organisation/site administrators manage compliance. Safeguarding leads get
  tracker and checks/training access plus medical read access. Ordinary users see
  only their own assigned agreements. Existing safeguarding restrictions remain.
- Small typed signal readers connect staff checks/training, agreements, attendance,
  medical completeness, safeguarding configuration, trip permissions and ACE records.
  Return counts, missing information, observation time and permission-safe links.
  Missing access or unavailable data means unknown, not zero or satisfied.
- Signals never tick a checkbox in v1. Portal changes refresh indicators while
  retaining manual history. Module subscriptions affect integrations, never legal
  applicability. No background automation service is required for v1.

## Delivery and verification

[DELIVERY.md](DELIVERY.md) defines the ordered steps and acceptance scenarios.
[COVERAGE.md](COVERAGE.md) explains the jurisdiction × sector × topic matrix.
[SOURCES.md](SOURCES.md) holds discovery references, not approved obligations.

Each step needs its own branch and PR against verified `FSS-Ltd/pathway` `master`.
Do not start the next step until current-revision required CI passes and GitHub
confirms merge. Production deployment needs separate authorization. Withdrawing a
pack or rolling back UI must retain evidence and acceptance/attestation history.
