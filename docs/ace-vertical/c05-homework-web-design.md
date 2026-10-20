# ACE-C05: homework web journeys

## Problem and scope

C02–C04 provide the assignment, submission, review and guardian read APIs,
plus staff and student web workspaces. A linked guardian still has no homework
screen, and the student workspace does not represent completed work or released
feedback correctly. This step completes the three web journeys using those
existing contracts. Mobile remains paused by the product owner, so C05 cannot
be accepted against the full master plan yet.

## Architecture and access

- Keep the staff draft/publish and review pages already introduced by C02 and
  C04. Improve only missing interaction states found by the web journey tests.
- Add a guardian page at the existing ACE family child route shape. It calls
  `GET /ace/family/sites/:siteId/children/:childId/homework` and displays only
  published assignment title, due time, submission status and explicitly
  released feedback. The API already checks active full legal access, current
  enrollment, ACE vertical, parent portal, active account and permission.
- Link to the guardian page only from an ACE parent child context that exposes
  `ace-summary`. This is navigation guidance, not authorization; the API remains
  the authority for every read. Keep the link and route behind a default-off
  `NEXT_PUBLIC_ACE_HOMEWORK_WEB_ENABLED` build flag until release. Keep the page
  read-only and omit evidence,
  student drafts, staff notes and unreleased feedback from its web types.
- Align the student web type with all API states, including `COMPLETED`, and
  represent returned and released feedback. Completed work is read-only.
  Preserve the existing idempotency key across a failed submit retry.

## Interaction and failure states

Use the existing ACE cards, buttons, typography and focus conventions. List
pages need clear loading, empty, denied/error and retry states. Detail views
need a visible status, keyboard focus on opening and returning, and useful
pending and success feedback. On a network failure, keep typed answers and
selected files so a student can retry; never claim upload progress that the
current Fetch transport cannot measure. At narrow width and enlarged text,
controls wrap and content does not require horizontal scrolling.

## Security, rollout and verification

No new schema or backend authorization path is needed. Keep C02 publication,
C03 submission, C04 review and notification flags off. A failed or revoked
guardian read must show a generic access error without carrying another
child's data forward. The guardian endpoint's PostgreSQL HTTP tests cover
released feedback and cross-tenant/relationship denial; add web interaction
tests for guardian privacy and student completed/returned states. Run the
relevant type, lint, format, unit, API integration and web build checks, plus
a keyboard and responsive review where a safe signed-in account is available.

Rollback turns off the web flag in a new deployment to hide the guardian link
and route; existing APIs and immutable
homework records remain. Success for this web slice means staff can draft and
review, a student can draft/upload/submit and inspect feedback, and a linked
guardian can read only released status and feedback on the web. Full C05
acceptance still requires the paused mobile journeys and the M20/C03 release
gates. The ACE master-plan count therefore remains 48/150 (32%).
