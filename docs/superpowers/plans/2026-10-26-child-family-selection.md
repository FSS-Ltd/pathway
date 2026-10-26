# Child and family database selection

**Goal:** Staff can browse existing child and family records instead of guessing a name in an empty search field.

**Scope and design:** One standalone delivery step, `CF-1`, against `master`. Replace the free-text filters in Children, Parents & Guardians, and session attendance with the existing native Select primitive. A small shared record filter accepts already-authorized records, a selected ID and an explicit all-records option. Keep secondary age, children-count and attendance-status filters. Include group/email context and disambiguate otherwise identical labels by record ID. Disable options while loading or empty. Refresh resets selection; a failed request clears old options. Preserve new-record name fields and healthy API-backed selectors, including mobile choices, safeguarding, learning, trips, notices, ACE and Finance.

**Data and security:** Reuse authenticated `fetchChildren`, `fetchParents` and attendance detail rows. `/children` and `/parents` enforce staff access and tenant scope. Existing AdminShell remounts pages by user and active site. No new data endpoint, polling, migration, dependency or public directory. No additional sensitive attributes are fetched.

**Acceptance:** Selecting a record filters by ID, including duplicate names; all-records restores the roster; secondary filters still combine correctly; loading, empty and failure states offer no stale records; refreshing cannot retain a removed selection. Native controls retain labels, keyboard support, focus rings and touch sizing.

**Delivery:** Implement and verify CF-1, open its PR promptly, and record current-head checks in the workspace delivery record. Do not label the step complete before GitHub confirms merge. Revert the PR to recover the previous filters.

## Plan

- [x] Add failing runtime regression for record selection and duplicate names in attendance.
- [x] Build shared `components/record-filter.tsx` with the existing Select, then replace the three free-text filters.
- [x] Test directory fetch-to-selection behavior and empty/loading/failure/refresh states; retain existing attendance save regressions.
- [x] Run admin unit suite, typecheck, lint, changed-file formatting, build, browser desktop/mobile and keyboard inspection, Graphify update and final diff review.
- [ ] Commit and open CF-1 PR; record CI revision, results and merge gate.

## Audit evidence

Mobile and Home child choices use authenticated `/children` or `/ace/pace/roster` IDs. Web signup creates new records. Admin learning, safeguarding, notices, trips, behaviour, PACE, timetable, family navigation, imports and Finance already offer database-backed selections. The mobile Family home contains a static example child display; it is not a search or selection flow and is outside CF-1.

## Baseline

Started from `ba3d7fd282b4aaf19d4ae5f9a0857dc6246b0ee8`. GitHub confirmed predecessor PR #750 merged with successful checks. Admin `test:unit` passed before implementation. Graphify generated a current code graph; HTML export exceeds Graphify's size limit.

## Verification and review

Admin typecheck, full unit script, changed-file ESLint, changed-file Prettier and production build passed. The build used explicit mock mode and a synthetic Clerk publishable key; it confirms compilation, not a production login. Regression tests cover authenticated API-backed choices and credentials, exact IDs with duplicate names, all-records reset, combined secondary filters, loading, empty/error/retry, and removal during refresh/reconciliation. Independent code review found one reconciliation reset issue; a failing regression reproduced it, the fix passed, and review found no remaining issues.

Playwright exercised the actual changed page/register components with existing Tailwind styles in an isolated local preview using synthetic HTTP API records and SessionRuntime. Desktop 1440×1000 and mobile 390×844 were inspected. Native parent dropdown selection via Tab, name type-ahead and Tab worked; accessible names, visible focus, 44px dropdown targets, ID selection and responsive results were checked. This does not verify live Clerk login or a deployed database. Browser console had only the preview favicon 404. Graphify refreshed the code graph; HTML export was skipped by its size limit.
