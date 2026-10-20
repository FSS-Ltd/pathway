# ACE-C03: student homework submission and evidence

## Problem and scope

A linked ACE student needs to save and submit work for an assignment released to
that child. Evidence must remain private and unavailable to staff or family until
the uploaded bytes are verified and malware scanning succeeds. This step covers
the student web/API submission flow and its storage boundary. Staff review and
return actions belong to C04; mobile remains paused.

## Architecture and decisions

- Resolve the signed-in student to exactly one active child through the existing
  student-identity policy, and require that child in the assignment's frozen
  recipient list. Check the assignment is currently `PUBLISHED`, not cancelled,
  before every draft, upload, or submit command. Return a generic not-found
  response for a different child or tenant.
- Store one submission per assignment recipient. Keep submitted and resubmitted
  versions immutable; a draft is mutable only before submission. Require a
  client-generated idempotency key for each submit command, with a database
  uniqueness constraint so retries return the original version. Record whether
  the submit time exceeded the assignment due time; late work is accepted and
  marked, since the build plan does not specify a late-work ban.
- An upload intent binds one generated private object key to tenant, recipient,
  assignment, uploader, expected size, MIME type, SHA-256 checksum, and expiry.
  The browser uploads with a short-lived Supabase signed upload URL. Completion
  downloads the private object server-side, checks the actual byte length,
  signature and checksum, then scans it. Clean bytes are copied to a separate
  private key before attachment, so the still-valid signed upload token cannot
  replace submitted evidence. Only that clean key may be attached to a version.
  No private download URL is issued for pending, rejected, or unscanned evidence.
  Reject unsafe filenames; never use a client filename in an object key.
- Allow PDF, PNG, and JPEG evidence, up to 2 MiB per file. This conservative
  limit fits the existing document upload convention and bounds inspection cost.
  A scanner outage fails closed. Abandoned intents expire and remain inaccessible;
  object cleanup can be handled by an operational retention job without changing
  submission history.
- Provide a focused student web screen with assignment details, text draft,
  evidence upload, submit confirmation, and clear loading, failure, and success
  states. Reuse existing ACE typography, cards, buttons, and focus treatment.

## Data and security

Use additive Prisma tables for submission, immutable version, and evidence
intent/record. Every row carries `tenantId` and composite foreign keys to the
recipient or submission. Apply the repository's tenant RLS policy and force RLS.
The API uses the existing authenticated request context and tenant transaction;
the storage service key remains server-side. The private bucket must not expose
objects directly to site users. Avoid logging bytes, tokenized URLs, filenames,
message text, or scanner responses containing file content.

## Rollout, rollback, and verification

`ACE_HOMEWORK_SUBMISSIONS_ENABLED` defaults to off. Enable it only after the
M20 release gate, a private bucket, a reachable malware scanner, and a linked
school account have been verified. Turning the flag off stops new uploads and
submissions while retaining records and private objects. Acceptance requires
PostgreSQL HTTP tests for state transitions, retries, child/tenant isolation,
unreleased assignments, file validation, and scan failure; UI interaction tests;
Prisma migration checks; and current-head CI followed by a confirmed PR merge.
The build-plan completion count stays 48/150 until the full C03 acceptance and
its M20 prerequisite are evidenced.

The API needs the existing `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, and private
bucket configuration, plus `ACE_HOMEWORK_CLAMD_HOST` and optionally
`ACE_HOMEWORK_CLAMD_PORT` (default 3310) on a private network. Scanner absence
or an error prevents inspection. Before enabling, verify that the bucket remains
private, a signed upload can be inspected and promoted, scanner detection
rejects a harmless test signature, and both allowed and denied linked accounts
behave as expected. No live scanner or linked-school rollout is evidenced yet.
