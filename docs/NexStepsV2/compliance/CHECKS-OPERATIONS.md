# Checks & Training operations

Step 1.3 implementation contract. This register stores role-specific evidence;
it does not determine legal eligibility or certify compliance. Country packs and
the site applicability profile remain separate gated steps.

## Access and data boundary

`compliance.checks.read` and `compliance.checks.manage` are institutional
capabilities. Organisation heads, site leads and safeguarding leads receive the
system-role defaults. Ordinary staff, parents and other adult accounts do not.
Custom roles use the existing permission administration and restrictions.

Every endpoint derives actor, organisation and active site from authenticated
context. The service resolves effective permissions again before its tenant RLS
transaction. Records and revisions have composite site/organisation foreign keys,
forced RLS, no runtime delete policy, and immutable history. A linked portal user
must belong to the site when the link is made; leaving later does not erase history.
Manual name/role records cover people who have no portal account. Adding a record
never means that a check is legally required for that person.

Free text, references and historical snapshots use the existing PII encryption
extension. Revision creation uses a separate model write so encryption applies.
Audit metadata contains action, record identity, version and kind, not the evidence
text. API responses prohibit caching. No certificate attachments are accepted here;
institutional evidence storage is a later deliverable.

## Dates, verification and concurrency

`completedOn` means certificate issue/training completion. `reviewDueOn` is the
organisation's next review action, never an automatically calculated certificate
expiry. An issuer's validity or membership end date must be checked separately and
may inform that review action. The form has no default check scheme or jurisdiction.

The server validates calendar dates and requires completion before recording or
verifying evidence. Verified records need verification notes; saving as verified
records the current actor/time. This is an internal verification event, not external
approval. Editing or archiving uses the expected record version. A conflicting
save returns 409 and the client retains its draft while showing the latest record.
Every successful mutation appends the encrypted snapshot and audit in the same
transaction; audit/history failure rolls back the mutation.

The overview counts active records, overdue organisation reviews and records
awaiting verification. It is not checklist completion, a staff eligibility count,
or an assertion that every required check has been entered.

## Export and retention handling

`GET /compliance/checks/:id/export` requires management permission and records an
EXPORTED audit event. It returns the scoped record plus a bounded history page;
follow `history.nextCursor` with the `cursor` query parameter until null for the
remaining history. Each response includes its export time. A reader's access to
history does not confer export-management permission. Household exports and child
DSAR exports do not include this separate institutional register.

Archiving removes a record from the active view while retaining its history.
The existing account deletion request process is a human-reviewed request, not
an automatic purge. Its reviewer must include these two institutional models:
`CompliancePersonnelRecord` and `CompliancePersonnelRevision`. Restrictive foreign
keys deliberately prevent account/site deletion from silently cascading history.

No universal retention duration is asserted or scheduled: the organisation must
apply its documented purpose, retention schedule, legal holds and applicable
requirements. Approved erasure/anonymisation requires a separately authorized,
audited data operation covering encrypted snapshots, references, audit metadata,
exports and backups. Ordinary register access cannot rewrite or purge history.
An archive action is not an erasure request. This change does not add a background
retention or automation service.

## Release and rollback

Apply the additive migration and the repository's protected permission-definition
and system-role synchronization workflow before enabling access in a deployment.
A migration alone does not update existing system-role grants. Use the approved
seed identity and deployment procedure; do not substitute runtime privileges or
run demo-data seeding casually. No production deployment is part of this PR.

A UI rollback leaves both tables, encrypted revisions and audit records intact.
Do not drop tables or roll back the audit enum to hide the feature. Verify default
role grants and a permitted/denied account against the deployed revision before
release. Production rollout remains separately authorized.

## Terminology source checks

Checked 13 October 2026 for this register's wording only; these are not published
country packs or complete applicability reviews.

- [DBS employer guidance](https://www.gov.uk/guidance/dbs-check-requests-guidance-for-employers):
  DBS certificates have no official expiry date; role eligibility and the lawful
  level of check still need to be established.
- [Disclosure Scotland's five-year membership announcement](https://www.disclosure.gov.scot/news/2026/04/five-year-pvg-scheme)
  and [transition questions](https://www.disclosure.gov.scot/news/2026/03/pvg-changes-questions):
  the five-year scheme began on 1 April 2026 with transitional arrangements for
  existing members. Do not apply a DBS date rule to PVG or infer a membership end
  date solely from an old certificate.
- [AccessNI check types](https://www.nidirect.gov.uk/articles/types-accessni-checks):
  different check levels disclose different information and have different
  application arrangements. Choosing the label in this register does not assess
  eligibility or perform a check.
