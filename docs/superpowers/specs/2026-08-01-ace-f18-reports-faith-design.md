# ACE-F18 Report and Faith Content Storage Design

Owner: Technical Agent
Status: Under Review
Created: 2026-08-01
Last Updated: 2026-08-01
Related Docs: `docs/superpowers/plans/2026-07-25-ace-core-foundation-access.md`, `docs/NexSteps-ACE-Vertical-Build-Plan.md`, `docs/superpowers/specs/2026-08-01-ace-f17-identity-relationships-design.md`

## Problem statement

ACE needs progress-report publication and Faith Corner content without granting family access to staff-only information, weakening tenant isolation, or making a released record mutable. Existing report bundles are staff-requested exports, not child-scoped family publications. Existing announcements do not model immutable versions, school-defined age audiences, student identity read state, or private reflections.

## Goals

- Store tenant-scoped ACE progress reports for a child and academic period.
- Preserve report source compilations, staff authoring data, review decisions, and immutable family-safe versions separately.
- Require maker/checker approval: the report author cannot approve their own report.
- Publish an approved report immediately to guardians with a current active `FULL` relationship to its child.
- Make student report access an explicit, later release on the published version.
- Store private document object keys only, never public URLs or document bytes.
- Let each school define named Faith age bands and publish Faith content to all active students or several selected age bands.
- Freeze Faith audience labels and bounds at publication while evaluating child age from the current child record.
- Record student read state and make reflections visible only to the authoring student and authorised staff unless staff explicitly releases a reflection to an eligible guardian.
- Enforce tenant-scoped relations, immutable released records, and RLS access boundaries in the database.

## Non-goals

- Report, Faith, age-band, or reflection endpoints and user interfaces.
- Capability or permission definitions.
- PDF generation, object upload, or a storage proxy.
- Class, group, year-group, or arbitrary query audiences for Faith content.
- Guardian access for `LIMITED` or `NONE` legal relationships.
- A generic publication framework shared with unrelated product areas.

## Approved policy decisions

| Decision | Rule |
| --- | --- |
| Guardian report access | A guardian can read the current report only through a current active `FULL` guardian-child relationship. A publication recipient snapshot is audit-only. |
| Student report access | Disabled by default. Staff must explicitly release a published version to the linked student identity. |
| Report publication | The author submits a draft. A different staff member approves it. Approval creates the immutable guardian-visible version in the same transaction. |
| Faith audience | Staff choose all active students or one or more school-defined age bands. |
| Age-band changes | A published audience keeps a snapshot of the selected band name and bounds. Later band changes affect only future publications. |
| Faith eligibility | Age-band eligibility is evaluated from the child date of birth at read time. A missing date of birth denies age-band access. |
| Faith reflections | The authoring student and authorised staff can read a reflection. A current active `FULL` guardian can read it only after staff explicitly release it. |

## Architecture

### Report records

`AceTermReport` is the tenant, child, and academic-period scoped report aggregate. It has a composite tenant foreign key to `Child` and `AcademicPeriod`; the report period must therefore belong to the same school as the child.

`AceReportCompilation` is an append-only source capture for one report. Its source payload is encrypted at rest because it can contain protected learning, attendance, and behaviour information. It records the actor and compilation time but does not expose a family payload.

`AceReportDraft` is the mutable staff authoring record. It references one compilation, stores the family-safe draft payload separately from encrypted staff-only notes, records its author, and moves through `DRAFT`, `IN_REVIEW`, and `APPROVED`. An approved draft is not editable.

`AceReportReview` is an append-only decision record. It includes the reviewer, decision, and encrypted review note. A database trigger rejects approval where the reviewer is the draft author. Approval may only occur from `IN_REVIEW` and atomically creates the published version.

`AceTermReportVersion` is immutable once published. It contains the family-safe rendered payload, its version number, an optional private document key, guardian release time, optional student release time, and a nullable link to the superseded version. Publishing a correction creates a new draft and a new version. Older versions remain available to staff audit; ordinary family reads select only the current version.

The document key must match `tenants/<tenant-id>/reports/<report-version-id>.pdf`. It is an opaque private storage location. The application will later serve it only through an authorised storage proxy.

### Faith records

`FaithAgeBand` belongs to one tenant and contains a unique name plus inclusive `minimumAge` and `maximumAge`. It can be archived to prevent new selection without changing historical audience snapshots.

`FaithContent` is the tenant-scoped logical content record. `FaithContentDraft` is a staff-editable unpublished draft. Publishing creates an immutable `FaithContentVersion`; modifying published content requires a new draft and a new version that supersedes the prior version.

`FaithContentAudience` belongs to a published content version. Each row is either `ALL_ACTIVE_STUDENTS` or `AGE_BAND`. An age-band row records the source age-band identifier for audit plus immutable snapshot name, minimum age, and maximum age. A publication may have several age-band rows. The target set is the union of selected rows. An all-students row cannot be combined with an age-band row on the same version.

`FaithReadReceipt` is unique by tenant, student identity, and Faith content version. It records when the linked student identity read a published version.

`FaithReflection` is unique by tenant, student identity, and Faith content version. Its reflection text is encrypted at rest. It records submission and optional guardian release information. Released reflections do not become visible to a guardian whose current `FULL` relationship later ends or is revoked.

## Data flow and access

1. A staff service creates a report compilation and draft under tenant RLS context.
2. The author submits the draft for review. A different staff member approves it.
3. The approval transaction appends the review decision, creates the immutable published report version, and sets guardian visibility immediately.
4. A later API service will resolve guardian reads through a current active `GuardianChildRelationship` with `FULL` legal access. Student reads will additionally require the active `StudentIdentityLink` and an explicit student release timestamp. F18 stores and validates those release facts but does not add authenticated-user context or family-specific RLS policies.
5. Staff define or archive tenant age bands. A Faith draft selects all students or several active bands.
6. Publication creates an immutable Faith version and audience snapshot rows. Student and guardian reads resolve target eligibility from the active F17 identity and relationship records. Child age is calculated from `Child.dateOfBirth` in the tenant timezone.
7. A student may create one encrypted reflection per Faith version. Staff can release it to guardians explicitly; no guardian receives it by default.

## Failure modes and safeguards

- A missing tenant context returns no rows under RLS.
- Cross-tenant child, academic period, user, identity, age-band, and version joins fail through composite foreign keys.
- Invalid age ranges, empty audience selections, duplicate all-students rows, and all-students plus age-band combinations fail through check constraints and indexes.
- Published report and Faith version content, audience snapshots, report source links, and supersession links cannot be updated in place. Corrections require a later version.
- Approval by the draft author fails in the database.
- A stored document key that does not match the tenant and version private-key shape fails in the database.
- Family-facing report payloads cannot contain staff-only notes because they are stored in separate columns and tables.
- A reflection guardian release does not bypass the current active `FULL` relationship requirement.

## Security and privacy

- Every new table carries `tenantId`, `@@unique([id, tenantId])`, tenant indexes, and composite foreign keys where a related record is tenant-scoped.
- Every new table receives enabled and forced RLS. Policies use the existing tenant context and do not grant access from identity alone.
- The migration revokes public access to all new tables, sequences, and helper functions.
- Source compilations, draft staff notes, review notes, and reflections use the repository’s PII encryption mechanism.
- Published report payloads are family-safe by construction. Report source snapshots, staff notes, and reviewer comments are never returned through family or student queries.
- This migration stores only private object keys. Upload, download, and signed URL issuance remain outside this stage.

## Verification

The focused RLS end-to-end suite will prove:

- published report and Faith versions cannot be mutated in place;
- report author and approver cannot be the same user;
- report approval creates guardian visibility while student visibility stays disabled until an explicit release;
- a correction supersedes the current report version without erasing the earlier version;
- private report document keys must match the tenant and version shape;
- Faith content accepts all-student or selected multi-band audiences and rejects invalid combinations;
- age-band snapshots do not change when the source band later changes;
- current age eligibility, absent dates of birth, read receipts, and reflection guardian releases behave as specified;
- `FULL`, `LIMITED`, ended, revoked, cross-tenant, unrelated, and missing-context readers cannot exceed their scope.

The change will run Prisma validation and generation, the focused report/Faith RLS suite, the strict RLS gate, affected API type and lint checks, and an independent code review before its pull request is opened.

## Rollout and rollback

The migration is additive and starts unused. Future report and Faith capabilities remain disabled until their services and routes are released. Rollback stops new writes and feature exposure while preserving released records for audit and a reviewed forward migration.
