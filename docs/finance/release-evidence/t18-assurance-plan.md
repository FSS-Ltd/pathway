# Finance T18 assurance implementation plan

> **For agentic workers:** Use `superpowers:executing-plans` with the approved delegation below. This is one T18 delivery unit, with one reviewed PR and no T19 implementation before its green merge.

**Goal:** Prove all A01–A48 monetary/access scenarios and the expanded statement, report, currency and UX contracts; fix findings and record a method-specific release recommendation.

**Architecture:** Keep the existing Finance services, immutable ledger, server access policy, private documents and scoped Stripe adapters. Add focused behavioral assurance tests and correct reproducible defects at their existing boundaries. Reuse existing UI primitives; no new dependencies or alternative payment model.

**Tech stack:** NestJS, strict TypeScript, Prisma/PostgreSQL16, Jest, Next.js/admin, Expo/Family Space, repository UI tests, Stripe Sandbox and in-app browser.

**Spec:** `../build-plan.md`, the user-approved expanded plan and A01–A48 in the supplied October Finance plan. The external plan is reference material, not authorization for production actions.

## Global constraints

- T17 PR733 merged at `74882be294cc2c71016a51eb146c3db23e69d226`; checked revision `be5027bb4a05d8dab33ca7a2983e53220da915f9` passed all eleven CI checks. T18 starts from that merge.
- Finance costs £29/month or £290/year; live commercial checkout remains gated.
- Use Sol, no Chrome, only disposable synthetic data and explicitly selected Sandbox credentials. Never read/source unrelated production environment values.
- No production deployment, migration, real payment, live feature activation or unapproved terms acceptance. T19 needs explicit owner authorization naming the live pilot scope.
- Preserve GBP plus the approved EU country/currency mapping. Keep fees/payouts separate from family debt; unknown outcomes retain their operation identity.
- All API/job/document/export/direct-URL paths enforce tenant/legal entity, roles, entitlement/servicing and payer grants. Revocation must clear protected client data.
- No invented statutory retention period. Technical preservation/export controls must be demonstrated; actual school retention/tax/notification approvals remain explicit live gates.
- One central disposable database runner owns migrations/resets. Audit/implementation agents must not reset it or access provider credentials. No task outside T18 may be implemented while this PR is open.

## Review focus

- Reinstatement after a replacement payment must restore only remaining invoice debt and expose excess as unapplied, including concurrent receipts and credits.
- Late evidence captured after period-end must not corrupt frozen statement continuity or block subsequent statement generation.
- Actual route denials and revoked-access transitions must prevent document/export/cache leakage; mocked access alone is insufficient evidence.
- Async UI responses must remain tied to current scope/filters; financial approval must expose the precise charge/tax details being approved.
- Provider-supported Sandbox behavior, signed ingress, account routing and payout evidence must be distinguished from local doubles and unproved live notifications.

## File ownership and deliverables

Parent owns core money/statement fixes, HTTP/ledger assurance, provider proof, evidence matrix, shared test execution and integration. The approved agents own separate staff and family UI files; a third may prepare isolated concurrency tests. No agent commits, pushes or opens a separate PR.

- Core: `apps/api/src/finance/finance-receipt-movement.service.ts`, focused return-allocation helper if needed, statement activity/snapshot modules and their tests.
- Assurance: focused tests under `apps/api/src/finance/tests/` and existing Stripe/access test directories; shared fixture only where genuinely reused.
- Staff: `apps/admin/app/finance/` workspace, invoice preview, report request state and focused interaction tests; `apps/admin/lib/finance-workspace-client.ts` detail contract.
- Family: `apps/mobile/src/features/finance/` scoped loading/revocation/pagination and tests.
- Evidence: this plan, scenario mapping and redacted results under `docs/finance/release-evidence/`; update existing `PROGRESS.md`, provider evidence and build-plan status.

## T18 execution checklist

- [x] Verify predecessor host merge, exact checked revision and all checks; record before starting T18.
- [x] Inspect the original A01–A48 scope and independent source/test audits. Distinguish confirmed defects from coverage gaps.
- [ ] Reproduce A18 and delayed-statement failures, observe RED, fix with current-debt serialization and consistent statement cutoff/adjustment rules; rerun affected real PostgreSQL tests.
- [ ] Add true overlapping manual-approval/provider success races, exact duplicate/restart and numbering/generator/scheduler cases, plus deterministic randomized ledger-sequence replay/projection checks. Existing behavior may pass new assurance tests; production fixes require a reproducer first.
- [ ] Exercise actual Finance HTTP guards/documents/CSV across active, servicing, locked, wrong tenant/payer and revoked grants; add changed-raw-body and missing safe-status/formula-prefix assertions.
- [ ] Reproduce and fix staff frozen-preview/approval, denied refresh, modal error feedback and stale report-filter responses. Verify existing UI tokens and loading/error/conflict states.
- [ ] Reproduce and fix family history pagination, focus/revocation clearing and stale in-flight reads. Test app return/school changes and repeated payment taps.
- [ ] Inspect Finance retention/export/deletion interactions, implement required technical preservation controls, and record unapproved policy decisions as live gates without inventing a period.
- [ ] Complete controlled Sandbox card/Bacs/cancellation/return/signed-event/restart/payout proof using real adapters. Record exact account/mode checks and distinguish unavailable provider scenarios from passed proof. Keep Bacs live-disabled.
- [ ] Render representative staff/family states in the in-app browser; check narrow screens, 200% text, keyboard/focus, semantic controls, financial confirmations, reduced motion and supported appearances. Do not claim native-device or screen-reader proof from source alone.
- [ ] Build an A01–A48 plus expanded-requirement evidence matrix with exact tests, commands, checked revision and limitations. Fail closed on any unresolved high money/access finding.
- [ ] Run relevant types/lint/format/unit/database/build/PDF/accessibility/end-to-end gates, inspect every changed file, and obtain one fresh Sol whole-branch review. Fix Important/Critical findings with RED/GREEN tests and a green suite.
- [ ] Refresh/rebase current GitHub master, publish only T18 PR, require current-revision CI success, merge within existing authorization and record host merge evidence. Do not start T19 until that gate clears.

## Evidence and release recommendation

A scenario passes only when its behavior is exercised and assertions inspect the intended boundary. Test names, successful commands that execute no tests, source inspection and a missing error are not substitutes. Provider fixtures and live-world requirements are labelled separately. Any unresolved mandatory Sandbox or application proof blocks T18 completion; live-only proof stays a named T19 gate, not a Sandbox success claim.
