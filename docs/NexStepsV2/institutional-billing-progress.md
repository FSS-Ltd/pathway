# Institutional billing delivery

The approved delivery order is recorded in PR 573 and the accompanying build plan. This record tracks the merge gate. Learning is a core platform capability. All other optional modules remain unavailable for new selection until each is separately marked ready.

| Step | Scope | PR | State | Gate evidence |
| --- | --- | --- | --- | --- |
| 1 | Correct module selections, grants, renewal scheduling and webhooks | [#573](https://github.com/FSS-Ltd/pathway/pull/573) | In progress | Reviewed baseline `6e83617a`; updated revision, current CI and merge evidence pending. |
| 2 | Shared enrolled-child pricing and catalogue | Pending | Blocked by step 1 merge | — |
| 3 | Continuing enrolment and verified counts | Pending | Blocked by step 2 merge | — |
| 4 | Quotes and census snapshots | Pending | Blocked by step 3 merge | — |
| 5 | Checkout and durable renewal processing | Pending | Blocked by step 4 merge | — |
| 6 | Institutional UI and tariff cutover | Pending | Blocked by step 5 merge | — |
| 7 | Lifecycle verification and controlled launch | Pending | Blocked by step 6 merge | — |

No production payment activation, provisioning or deployment is included in these merge gates. Update each row with the checked revision, check results and merge commit before beginning the next step.
