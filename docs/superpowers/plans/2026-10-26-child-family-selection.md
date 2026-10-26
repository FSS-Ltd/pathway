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
- [x] Commit and open CF-1 PR; record CI revision, results and merge gate.

## Audit evidence

Mobile and Home child choices use authenticated `/children` or `/ace/pace/roster` IDs. Web signup creates new records. Admin learning, safeguarding, notices, trips, behaviour, PACE, timetable, family navigation, imports and Finance already offer database-backed selections. The mobile Family home contains a static example child display; it is not a search or selection flow and is outside CF-1.

## Baseline

Started from `ba3d7fd282b4aaf19d4ae5f9a0857dc6246b0ee8`. GitHub confirmed predecessor PR #750 merged with successful checks. Admin `test:unit` passed before implementation. Graphify generated a current code graph; HTML export exceeds Graphify's size limit.

## Verification and review

Admin typecheck, full unit script, changed-file ESLint, changed-file Prettier and production build passed. The build used explicit mock mode and a synthetic Clerk publishable key; it confirms compilation, not a production login. Regression tests cover authenticated API-backed choices and credentials, exact IDs with duplicate names, all-records reset, combined secondary filters, loading, empty/error/retry, and removal during refresh/reconciliation. Independent code review found one reconciliation reset issue; a failing regression reproduced it, the fix passed, and review found no remaining issues.

Playwright exercised the actual changed page/register components with existing Tailwind styles in an isolated local preview using synthetic HTTP API records and SessionRuntime. Desktop 1440×1000 and mobile 390×844 were inspected. Native parent dropdown selection via Tab, name type-ahead and Tab worked; accessible names, visible focus, 44px dropdown targets, ID selection and responsive results were checked. This does not verify live Clerk login or a deployed database. Browser console had only the preview favicon 404. Graphify refreshed the code graph; HTML export was skipped by its size limit.

## Delivery evidence

[PR #751](https://github.com/FSS-Ltd/pathway/pull/751) targets `master` from `feature/child-family-db-selection`. The implementation revision `ea02799440e471bca374d6cd6403b3ddaebf9dcb` passed the local checks above. The unchanged commit hook also passed repository lint, API 376 suites / 2,552 tests, workers 24 suites / 139 tests, and auth 3 suites / 15 tests with a temporary two-worker CPU budget. An earlier unbounded run was interrupted after heavy memory swapping and is not counted as passing.

The PR's **CF-1 delivery evidence** section maintains the current checked head and test-merge revisions, individual CI conclusions, review status, and host-reported merge commit. Consult that live record for delivery state rather than treating this implementation checklist as proof of merge. The user authorized merging PR #751 only after all required CI passes. No production deployment has been requested here.

## CF-2: Roles and Access correction

The user reported that Roles and Access was missed. Its People directory already reads the permission-protected, organisation-scoped `/access/users` endpoint, but its only filter requires typing. Add the same native record dropdown used by CF-1. Choices come from the current bounded directory page, include email context, and open the selected person's existing access profile by ID. Retain the table, fixed-role filter, row selection and cursor pagination. Keep name/email narrowing as an optional control beneath the dropdown. Explain how to browse further pages beside the dropdown. Hide stale choices during loading and after failures.

This corrects the original audit's exclusion of the access directory. A dropdown over every organisation member would require unbounded fetching; a custom searchable combobox would duplicate the existing directory's pagination and loading logic. Reusing the native dropdown over each page preserves bounded queries and keyboard support without dependencies or new API permissions. New-record creation and badge-name search retain their existing controls.

**Files:** `people-directory.tsx` owns the dropdown and page hint; `roles-workspace.tsx` accepts clearing person selection; `page.test.tsx` verifies the real workspace and HTTP boundary. No API, schema or permission changes. Roll back by reverting the CF-2 commit.

- [x] Add a failing workspace regression for the missing person dropdown, duplicate names, paginated choices, fixed-role filtering and loading/error states.
- [x] Add the shared record dropdown with optional narrowing for larger directories.
- [x] Run the regression, full admin unit suite, typecheck, lint, formatting, build, desktop/mobile inspection, Graphify update and diff review.
- [ ] Commit, open a follow-up PR and record current-revision checks and delivery state there.

**CF-2 verification:** The workspace regression failed first because the dropdown was absent, then passed with the fix. Full admin `test:unit`, `typecheck`, changed-file ESLint/Prettier, `git diff --check` and the admin production build passed. The build used the same explicit mock flag and synthetic Clerk key as CF-1. Independent review found no actionable issues. Codex in-app browser inspection covered keyboard selection of duplicate names, the selected profile, pagination, and mobile selection/back navigation in a 390×844 iframe. The mobile document and viewport both measured 390px wide; the dropdown measured 44px high. Synthetic HTTP records and the real workspace/components/styles were used; live signed-in database browser testing remains unavailable. Preview-only favicon 404 was the only browser error. The Chrome automation session was closed at the user's request; browser work now uses the in-app browser under a persisted global rule.

The follow-up PR for `fix/roles-access-person-selection` maintains current-head CI and merge evidence. Local implementation verification is not a claim that the delivery step has merged. No production deployment is part of this correction.
