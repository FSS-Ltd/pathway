# Family identity invitation import

**Build step 1.3e5o; ACE-M15 bulk import web and API slice.** Mobile work remains
paused.

## Problem and scope

Schools need to invite many guardians and students without creating duplicate
accounts or granting access before the recipient accepts. An organisation admin
uploads a site-specific CSV of child IDs, target, email, review basis, and a
per-row confirmation. A student row confirms the school's age, consent, and
safeguarding approval for that student. A guardian row confirms legal access
from school records or a legal document. The existing individual invitation
services remain the authority for eligibility, audit, email, and acceptance.

## Import contract

The API accepts at most 10 rows per request to stay within the API function's
30-second execution limit. It validates the complete request
before processing, requires `students.manage` and organisation-admin access,
and processes rows in file order. Each row returns `invited`, `existing`, or
`failed` with its one-based row number and a safe message. A failure does not
roll back earlier rows. The web client sends a larger file in sequential
batches and displays row outcomes; uploading the same file again retries only
rows without a matching historical invitation.

Inside the invitation transaction, a child lock and a global normalized-email
lock serialize account lookup and creation. Import mode checks for any prior
invitation with the same site, child, target, and normalized email. It leaves
that record unchanged, including accepted, expired, or revoked records, and
does not send another email. Staff must use the child profile to resend or
create a replacement after review. This makes database effects restartable
without a batch table or migration. Email delivery is not exactly once: when
delivery fails after the invitation commits, a retry reports the existing
record and staff can resend from the child profile.

The CSV template comes from the current site roster so child IDs need not be
typed. The browser checks each uploaded child name against that roster to
catch spreadsheet row mismatches before any email is sent. The browser parses
a strict UTF-8 CSV with headers
`childId,childName,target,email,reviewBasis,confirmed`; `confirmed` must be
`yes` on each populated row. `reviewBasis` is required for guardians and blank for
students. The preview shows count and validation errors before the send action.
The file is handled in browser memory and is not stored. API responses avoid
returning child or email data because the staff page already has the source
rows. No reusable invitation token is created.

## Verification and rollback

Test duplicate rows and retries, account reuse across children, per-row
approval validation, tenant denial, mixed success/failure, and recipient access
remaining unavailable until verified acceptance. Check narrow layout, keyboard
use, focus, loading, error, and results states. Rollback removes the import
route and API endpoint; existing invitations remain manageable in each child
profile and auditable. Roll out through the existing organisation-admin
permission gate after the PR's database CI runs. A successful import has one
account per normalized email, no duplicate invitation on retry, and no family
data access before accepted relationships are active.
