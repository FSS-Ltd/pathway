# User Agreements: step 1.5 implementation contract

Approved scope: versioned institutional documents, assignment to adult portal
users, in-portal acknowledgement, recorded signed copies and historical acceptance.
Existing guardian consents and trip permissions remain separate. This is a record
of an acknowledgement or a staff-recorded signed copy, not a claim about legal
signature validity. No emails or external messages are sent by this step.

## Ownership and access

The authenticated active site is the boundary. Every record carries tenantId and
orgId, with composite foreign keys, forced RLS and the established private-storage,
PII encryption and audit mechanisms. Controllers derive actor/site/organisation
from authentication; supplied scope is rejected. Sensitive responses are no-store.

Institutional `compliance.agreements.read` and `.manage` permissions default to
organisation heads and site leads only. Safeguarding leads gain no general access
to other users' agreements. Custom read-only access uses the existing controls.
The same institutional read capability enables the own-assignment surface, but an
ordinary user's right to it comes from their assignment and active site membership,
not a general read permission. Own endpoints enforce recipientUserId=current user;
management endpoints resolve effective permissions. Home has no entitlement.

Assignment requires active membership at the site and explicit administrator
confirmation that every selected recipient is an adult (18+ for this product
flow). A known under-18 date of birth on the user or an active same-site linked student
record is rejected even with that confirmation. Conflicting age evidence fails
closed rather than overriding a known minor.
Missing age is not inferred from parent/staff status; the confirmation is retained
on the assignment. Eligibility is rechecked before acknowledgement. Recipient
choices expose only names and whether age confirmation is needed, not birthdays.

## Data model

- `ComplianceAgreementDocument`: id, tenantId, orgId, latestVersion (integer),
  createdAt, createdByUserId. Document identity is stable; publishing uses a
  compare-and-swap on latestVersion.
- `ComplianceAgreementVersion`: id, scope, documentId, version (integer), title,
  contentText, originalStorageKey?, originalFileName?, originalSha256?, createdAt,
  createdByUserId. Unique document/version and composite scoped identity. Published
  versions are immutable. Title, contentText and originalFileName are encrypted.
- `ComplianceAgreementAssignment`: id, scope, versionId, recipientUserId,
  assignedAt, assignedByUserId, adultConfirmedAt, supersededAt?. Unique version and
  recipient. Identity/recipient cannot change; only supersededAt may change once.
- `ComplianceAgreementAcceptance`: id, scope, assignmentId (unique), method
  (`ACKNOWLEDGED` or `RECORDED_SIGNED_COPY`), typedName, recordedAt,
  recordedByUserId, signedOn?, signedStorageKey?, signedFileName?, signedSha256?.
  Immutable. typedName and signedFileName are encrypted. Method-specific fields
  must be valid; acknowledgement is performed only by the recipient, recording
  a signed copy only by a manager. References are restrictive, not cascading.

Publishing a newer version supersedes all prior assignments for the document,
including accepted ones, without changing their acceptance record. Acknowledging
or attaching a signed copy to a superseded version is rejected. Publishing,
assignment and acceptance serialize on the stable document row so an old-version
acceptance cannot race publication. Reassigning the same version is idempotent and
never resets acceptance. New versions require new explicit assignments.

## Document and file handling

Each published version has a required title and readable plain-text content,
rendered as escaped text. An optional original PDF can accompany it. A signed copy
is a separate PDF linked to exactly one assignment and acceptance. Acknowledgement
records the exact immutable version. There is no canvas signature or generated
signature certificate in this version.

Files are limited to 2 MiB, strictly decoded from base64 and checked for a PDF
signature. They are stored under tenant-isolated random immutable keys in the
existing private bucket. Downloads are authorized through the API, verify SHA-256,
use attachment disposition and nosniff, and never return storage credentials or
unrestricted object URLs. No claim of antivirus scanning or full PDF validation
is made. Missing storage configuration fails explicitly; no inline database file
fallback is introduced. A rejected database transaction may leave an unreferenced
private upload; retain the key for controlled cleanup without exposing it to users.
Do not mutate existing stored files or delete history during UI rollback.
Controllers use the existing IndependentTransaction marker; services explicitly
open tenant-scoped transactions. File transfers occur outside database transactions,
with scope/version eligibility rechecked inside the subsequent locked mutation.

## Typed API contract

Base `/compliance/agreements`. Lists are bounded cursor pages with `items` and
`nextCursor`. Unknown input fields and client actor/scope values are rejected.
IDs are UUIDs. Strings: title 1–200, contentText 1–20000, typedName 1–200.

Shared types in `packages/types/src/agreements.ts`:

- `AgreementPdfInput`: `{fileName: string, base64: string}`.
- `AgreementVersionInput`: `{title: string, contentText: string, originalPdf: AgreementPdfInput | null}`.
- `AgreementVersion`: `{id, documentId, version, title, contentText, hasOriginalFile, createdAt}`.
- `AgreementDocument`: `{id, latestVersion: AgreementVersion, createdAt}`.
- `AgreementAcceptance`: `{id, method, typedName, recordedAt, recordedByUserId, signedOn: string|null, hasSignedCopy: boolean}`.
- `AgreementAssignment`: `{id, version: AgreementVersion, recipientUserId, recipientName, assignedAt, adultConfirmedAt, supersededAt: string|null, acceptance: AgreementAcceptance|null}`.
- Page types: `AgreementDocumentPage`, `AgreementVersionPage`, `AgreementAssignmentPage`.
- `AgreementPerson`: `{id, name, ageStatus: 'KNOWN_ADULT'|'NEEDS_CONFIRMATION'}`; `AgreementPeoplePage`.

Dates/timestamps serialize as strings; signedOn is YYYY-MM-DD. File keys/hashes
remain server-only. Input arrays are bounded to 50 unique recipients per request.

| Method/path                          | Access and result                                                                                    |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| GET `/mine?cursor`                   | Own assignments including history; AgreementAssignmentPage                                           |
| GET `/documents?cursor`              | Read permission; AgreementDocumentPage                                                               |
| POST `/documents`                    | Manage; AgreementVersionInput → AgreementDocument                                                    |
| GET `/documents/:id/versions?cursor` | Read; AgreementVersionPage                                                                           |
| POST `/documents/:id/versions`       | Manage; AgreementVersionInput plus expectedVersion → AgreementDocument                               |
| GET `/people?query&cursor`           | Manage; AgreementPeoplePage (bounded candidate pages; an empty filtered page may have a next cursor) |
| POST `/versions/:id/assign`          | Manage; `{recipientUserIds, adultsConfirmed:true}` → AgreementAssignmentPage                         |
| GET `/assignments?cursor&documentId` | Read; AgreementAssignmentPage                                                                        |
| GET `/assignments/:id`               | Read permission or own recipient; AgreementAssignment                                                |
| POST `/assignments/:id/acknowledge`  | Own recipient; `{versionId, typedName, confirmed:true}` → AgreementAssignment                        |
| POST `/assignments/:id/signed-copy`  | Manage; `{versionId, typedName, signedOn, pdf:AgreementPdfInput}` → AgreementAssignment              |
| GET `/versions/:id/file`             | Read permission or an own assignment to this version; original PDF attachment                        |
| GET `/assignments/:id/signed-copy`   | Read permission or own recipient; signed PDF attachment                                              |

Read/list/download/export and mutations are audited without document text, names
or file bytes in metadata. A scoped JSON export can reuse assignment detail plus
its original and signed downloads in the existing human-reviewed data-request
process. No new automatic retention service is needed; approved erasure covers
all four models, private files, audits, exports and backups.

## Interface and verification

One Compliance → User Agreements route shows My agreements to eligible signed-in
site users. Managers additionally get a document/assignment management area.
Create/version forms include readable content and optional original PDF; publishing
warns that prior assignments become historical. Assignment uses explicit adult
confirmation. Recipients review the exact version and actively acknowledge it with
a typed name. Managers can record a dated signed PDF; accepted/superseded records
remain inspectable. Avoid implying that an administrator acknowledged for a user.

Reuse existing tokens, small components and typed clients. Include loading, empty,
error/retry, pending upload/save, version conflict and permission states; cancel
stale site requests. Inspect desktop/mobile, keyboard and 200% text. Required tests
cover permissions, cross-site/org/recipient/file isolation, encrypted fields,
immutable history, stale/superseded acceptance, duplicate assignment, concurrent
publication/acceptance, failure rollback and unchanged guardian/trip flows.

Deployment remains separately authorized. Apply additive migrations and protected
permission/role synchronization before rollout; preserve records if the UI is
withdrawn. Record final evidence in PROGRESS.md and satisfy PR/CI/merge before 1.6.
