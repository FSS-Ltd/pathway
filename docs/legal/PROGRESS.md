# GDPR first-use agreement delivery

The designated base is `master`. Each step needs its own branch and PR. Do not begin the next step until the current PR is green on its latest revision and GitHub confirms it is merged.

| Step                           | State                          | Branch / PR                                                                     | CI and merge evidence                                                                                           |
| ------------------------------ | ------------------------------ | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| GDPR-1.1 Documents             | Draft; publication checks open | `docs/gdpr-1-1-policy` · [PR #629](https://github.com/FSS-Ltd/pathway/pull/629) | First submitted revision `03d8515ed75380c3f6a39c61dc8527fc0579d9c6`; CI in progress at first check. Not merged. |
| GDPR-1.2 Backend               | Planned                        | —                                                                               | Wait for GDPR-1.1 CI and merge.                                                                                 |
| GDPR-1.3 Web                   | Planned                        | —                                                                               | Wait for GDPR-1.2 CI and merge.                                                                                 |
| GDPR-1.4 Mobile and activation | Planned                        | —                                                                               | Wait for GDPR-1.3 CI and merge.                                                                                 |

GDPR-1.1 local verification: web TypeScript and ESLint passed; 19 web unit suites and 140 tests passed; new document formatting and staged diff check passed; legal pages were visually inspected at desktop and phone widths. The web production build compiled and checked types but could not prerender the existing `/signup` page because this clean worktree has no Clerk publishable key. The local pre-commit hook could not start because its `pnpm` launcher exits at dependency build-script approval; direct checks were run and the PR's CI remains authoritative.

The owner confirmed the privacy mailbox is monitored. The [retention schedule](./RETENTION_SCHEDULE_DRAFT.md) and [provider transfer/DPA register](./PROVIDER_TRANSFER_DPA_REGISTER_DRAFT.md) are drafts without approved periods, verified production regions or FSS contract evidence. Confirm these and the remaining [publication checks](./GDPR_RESEARCH_2026-10-15.md) before publishing the new legal wording or merging PR #629. The next permitted implementation step is GDPR-1.2 only after PR #629 has passing CI on its latest revision and a confirmed merge commit.

The planned acceptance record belongs to the authenticated adult and a document version. Historical parent signup consent and `firstLoginAt` are not acceptance evidence. The adult agreement does not cover child-operated accounts.
