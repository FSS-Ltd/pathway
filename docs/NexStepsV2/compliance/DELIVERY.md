# Delivery and acceptance

The approved plan is delivered sequentially. Each row is a distinct branch/PR.
Current evidence belongs in [PROGRESS.md](PROGRESS.md), not in checked boxes here.

| Step      | Deliverable                                                                   | Acceptance                                                                                                                                                                                      |
| --------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1       | Research structure, coverage matrix, delivery record, Codex verification rule | All 31 jurisdictions, six institutional sectors and eight topics explicitly awaiting review; source/review fields and publishing gates documented; rule added to AGENTS and referenced by BUILD |
| 1.2       | Learning Centre taxonomy and complete configurator-to-provisioning flow       | Both types survive checkout, pending orders and payment-confirmed provisioning; correct reused screens/permissions; server validation and legacy compatibility                                  |
| 1.3       | Compliance navigation and Checks & Training                                   | Role-appropriate checks, localized schemes, permissions, encryption, audit history and integration tests                                                                                        |
| 1.4       | Medical Information and editing integration                                   | Reuse child records; unknown/none distinction; access-boundary tests                                                                                                                            |
| 1.5       | Versioned User Agreements                                                     | Adult assignments, acknowledgement, signed copies, supersession and historical acceptance tests                                                                                                 |
| 1.6       | Site profile, applicability, manual tracker, progress, evidence and signals   | Persistence, concurrency, tenant isolation, unknown/partial coverage, permissions and calculation tests; live evidence never auto-completes                                                     |
| 2.01–2.31 | One jurisdiction pack per step                                                | All institutional sectors and topics assessed, regional distinctions resolved, current sources reviewed, applicability fixtures validated and coverage updated                                  |

Pack order and step IDs are in [jurisdictions.csv](jurisdictions.csv). Each country
pack must identify relevant national and regional authorities and provision types.
Common EU content is reusable but national implementations are not interchangeable.
A pack may publish reviewed cells progressively while declaring all remaining gaps.
A pack step is not complete until all its sector/topic/regional scope is assessed;
“no applicable requirements” requires a documented, reviewed reason.

## Required scenarios

1. ACE and Public Learning Centre identity survives the complete purchase flow;
   both receive the intended screen mappings and permissions.
2. An ACE independent school receives applicable independent-school duties plus
   ICCE duties only when offering ICCE. Public learning centres are not inferred
   to be government-funded.
3. UK nations and EU regions select distinct requirements. Missing location or
   provider information produces unresolved applicability, not an English default.
4. Checkboxes persist after reload and remain isolated between sites. Failed and
   concurrent saves expose recoverable states without losing history.
5. Profile changes, superseded requirements, permitted N/A reasons, unconditional
   duties, empty totals, overdue reviews and partial coverage calculate correctly.
6. Live evidence updates without auto-completion or restricted-record disclosure.
   Unavailable or inaccessible signals are unknown.
7. Cross-tenant API, attachment, medical and agreement access fails. Ordinary
   users cannot read other recipients' assignments, evidence or historical copies.
8. Existing safeguarding restrictions and Nexsteps Home flows retain behaviour.

## Checks for affected implementation steps

Derive exact commands from the current package scripts and CI before running them:
formatting, lint, affected package typechecks, unit tests, API/database integration,
Prisma validation, permission-definition checks and affected web/admin/API builds.
Explicitly lint changed admin `app`, `components` and `lib` files: its current lint
script targets `src`. Record exact commands, results, environment limitations and
inspected scenarios. Inspect running flows on desktop and mobile, using keyboard
navigation and enlarged text. Review every changed file and the final diff.

For source packs, additionally review current source editions, authority, effective
dates, jurisdiction boundaries, obligation class and applicability fixtures. A
reachable link alone does not verify a duty. Do not publish unreviewed requirements.

For documentation-only 1.1, inspect prose and links, validate matrix completeness
and status integrity, run applicable formatting and diff checks, and review the
branch. Runtime/type/database/UI checks are not applicable unless code changes.
Required host checks still govern merge; never treat skipped/missing checks as green.

## Delivery evidence and recovery

Before a step, verify its predecessor's PR, current checks and actual merge from
GitHub. Use purpose branches, never `codex/`. Preserve unrelated local edits. After
local verification, promptly create/attach the PR; use a draft if blocked. Record
head SHA, any required test-merge/queue SHA, check names/conclusions, review status,
merge commit and next permitted action. Pending, skipped or stale checks do not pass.

Merge only within existing authorization and repository protections. Do not bypass
reviews, force-push shared history or proceed on an unmerged predecessor. Refresh
the base after verified merge. Keep durable merge evidence in the progress record
or linked PR record without claiming that a pre-merge document predicts the merge.

Use additive migrations; retain historical records if withdrawing a pack or rolling
back UI. Step 1.1 is reversible documentation only. No deployment is included.
