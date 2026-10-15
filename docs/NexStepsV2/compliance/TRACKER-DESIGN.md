# Site tracker: step 1.6 contract

The active institutional site is the boundary. Completion is a manual checklist,
never legal certification. No reviewed country pack ships in 1.6: all 31 packs
retain explicit unreviewed topic/sector/regional coverage. Synthetic requirements
exist only in tests. Country packs are published in the following gated steps.

## Profile and applicability

Use the existing Jurisdiction hierarchy (country/nation/region/local authority),
with UK nation selection mandatory for resolution. Add missing EU country entries
as NOT_CONFIGURED without changing household content or its review state. Store
selected jurisdictionId and explicit region/local-authority text; never infer
location from billing. The selected jurisdiction determines country/nation through
its validated ancestor chain. Missing country or nation remains unresolved.

Profile fields: jurisdictionId, region, localAuthority, sector, vertical,
providerCategory, fundingStatus, minimumAge, maximumAge, provisionPattern,
childcare, charitable, food, transport, trips, boarding, ace, icce. All may be null
for unknown. Sector/type combinations use institutionalSector; nursery remains a
SCHOOL vertical but has distinct research coverage. providerCategory is one of
INDEPENDENT_SCHOOL, STATE_SCHOOL, EARLY_YEARS, CHILDCARE, OUT_OF_SCHOOL, OTHER;
fundingStatus PUBLIC, PRIVATE, MIXED; provisionPattern FULL_TIME, PART_TIME, MIXED.
Ages are whole years 0–100 with minimum <= maximum. Boolean activities and ACE/ICCE
are explicit true/false/unknown; ACE screens do not imply legal school status or
ICCE participation. Public Learning Centre does not imply public funding.

Conditions are declarative, schema-validated all/any/not groups and typed field
comparisons. Evaluation has APPLICABLE / NOT_APPLICABLE / UNRESOLVED states;
unknown inputs cannot satisfy conditions or be silently treated as false. Conditions
may inspect countryCode/subdivisionCode derived from the validated hierarchy.
Unsupported regions, missing regional detail and stale/unavailable packs remain
coverage gaps. Subscription modules affect signals only, not legal applicability.

## Versioned catalogue and progress

Runtime catalogue files are committed, versioned and schema-validated through
NestJS; use explicit static imports that survive API builds. Reuse the research
record contract in RESEARCH.md, existing source states and default 90-day review
window. Published requirements need source/territorial/effective-date review,
immutable ID/version, action/topic/class, applicability explanation, expected
evidence, allowed N/A policy, material-change metadata and signal keys. Published
coverage must identify jurisdiction × research sector × topic and regional scope;
reviewed empty cells require reviewed source-backed rationale. Catalogue validation
rejects duplicate IDs/versions, dangling sources, invalid dates and unreviewed
published content. Review expiry/withdrawal creates gaps and excludes current use.

Progress counts current COMPLETE attestations for applicable published requirements
whose requirement version and profile revision still match and whose manual review
date has not passed. N/A is allowed only where the requirement explicitly permits
an override, requires a reason, and is counted separately (excluded from the
applicable denominator); unconditional requirements cannot be dismissed. Unknown
applicability, evidence gaps, overdue reviews, stale confirmation and unavailable
coverage are separate counts. Empty denominator says No applicable items, alongside
coverage warnings. Category progress follows the same rules. Portal signals never
change attestations. Changed profiles and requirement supersession retain history
and require renewed confirmation; unchanged profile saves preserve the revision.
Withdrawing a pack never deletes records.

## Records, permissions and API

Add scoped Prisma models with forced RLS, composite foreign keys, indexes, audit
and sensitive-field encryption:

- ComplianceSiteProfile: one per tenant/org, version integer, encrypted profileJson,
  created/updated times and actor. CAS expectedVersion (0 means initial create).
- ComplianceProfileRevision: immutable profile snapshots and actor/time per version.
- ComplianceAttestation: append-only per requirement revision, exact requirement
  ID/version and snapshot, exact profileVersion, status COMPLETE/NOT_STARTED/
  NOT_APPLICABLE, encrypted notes/reason, optional reviewDueAt, actor/time. Unique
  tenant/requirement/revision. Lock site profile to serialize expectedRevision writes.
- ComplianceEvidence: independent of child, tenant/org, requirement ID/version,
  encrypted title/notes/fileName, private PDF key/hash, actor/time, optional archivedAt.
  Keep historical links and audit archive; no destructive delete endpoint.

Add compliance.tracker.read/manage capabilities to institutions and default grants
for org heads, site leads and safeguarding leads. Resolve tenant/actor from auth;
no ordinary user access. Existing safeguarding access remains unchanged. All reads,
exports and writes audited without sensitive content; no-store responses. Use
IndependentTransaction with explicit scoped transactions, transfers outside DB
transactions and fresh authorization after upload. Private PDF max 2MiB, exact
signature/canonical base64/hash verification, attachment/nosniff; use existing
private-storage conventions. A failed commit may leave a private orphan, logged for
controlled cleanup. No new dependency or automation service.

API base /compliance/tracker:

- GET /jurisdictions: hierarchy choices (id, countryCode, subdivisionCode, name,
  level, parentJurisdictionId); tracker read.
- GET /profile: profile + version, or null; read.
- PUT /profile: {expectedVersion, profile}; manage.
- GET /checklist: current profile/version, items, category/overall progress,
  unresolved/gaps/overdue/stale counts and coverage. Read; no legal certification.
- POST /attestations: {requirementId, requirementVersion, profileVersion,
  expectedRevision, status, notes, notApplicableReason, reviewDueAt}; manage.
- GET /history/requirements?cursor: bounded retained requirement index, including
  evidence-only records, independent of current catalogue or profile; read.
- GET /history?requirementId&cursor: bounded immutable attestations, including
  historical requirement snapshots; read.
- GET /signals: typed live observations; read plus underlying record permissions.
- GET /evidence?requirementId&cursor: bounded metadata; read.
- POST /evidence: {requirementId, requirementVersion, title, notes, pdf}; manage.
- POST /evidence/:id/archive: manage; audited soft archive.
- GET /evidence/:id/file: read; scoped authorized private attachment.

Shared types are the contract between API and UI. Invalid bodies/unknown scope
fields rejected. Bounded pages max50; cursor scoped to site/requirement. Preserve
manual drafts on conflicts or failed saves. Profile expectedVersion and attestation
expectedRevision prevent lost updates; stale profile submission rejected.

## Signals and interface

Seven small readers: personnel checks/training, agreements, attendance, medical
completeness, safeguarding configuration, trip permissions and ACE records. Return
key, status KNOWN/UNKNOWN, count, missingCount (nullable), description, observedAt,
and permission-safe href (or null). Unavailable data/module/access is UNKNOWN.
Counts describe recorded evidence, not legal adequacy. Never disclose restricted
record details or links, and never write a confirmation as a side effect.

Overview & Tracker precedes the existing Compliance navigation links. Compact
completion summary, explicit coverage warning, profile editor, grouped checklist
rows and accessible details panel (inline details acceptable). Show action,
applicability, sources, evidence expectations, notes, review date, manual checkbox,
N/A reason where permitted, evidence uploads/history and live signals. Provide
loading/empty/error/retry/pending/conflict states, scoped request cancellation,
keyboard access, mobile layouts and enlarged text. Initial production empty state
must let an administrator save a profile and see unreviewed coverage; use injected
test catalogues to verify full checklist behavior before country packs publish.

## Retention, export and release operations

Use the existing human-reviewed data-request process for institutional records.
The scoped profile, paginated attestation history and evidence metadata/downloads
support a reviewed export; include retained profile revisions through an authorized
operator export when needed. These records are separate from household and child
DSAR exports. Read/download auditing must remain enabled during collection.

Archive removes evidence from current counts, not from retained history or private
storage. Apply the organisation's documented retention schedule and legal holds;
there is no universal retention period or automatic purge in this version.
Approved erasure/anonymisation is a separately authorized, audited operation that
covers ComplianceSiteProfile, ComplianceProfileRevision, ComplianceAttestation,
ComplianceEvidence, private files, actor references, audit metadata, exports and
backups. Restrictive keys and immutable-history triggers prevent ordinary account
or site deletion from silently discarding these records. Failed upload commits
produce a private orphan log; verify the key has no retained evidence reference
before controlled cleanup. Never treat archive as erasure.

Deployment requires the additive migration and the existing protected permission
registry/system-role synchronization process. Migrating alone does not grant
tracker permissions to existing roles. Production deployment is separately
authorized. Rollback the route or withdraw a catalogue pack while retaining all
institutional records and private files.
