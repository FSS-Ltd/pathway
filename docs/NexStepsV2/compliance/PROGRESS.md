# Compliance delivery progress

Plan: [README.md](README.md), [DELIVERY.md](DELIVERY.md).
Updated: 2026-10-13. Base repository: `FSS-Ltd/pathway`; branch: `master`.

## Current step: 1.1

**State: locally verified; awaiting PR/CI/merge; not complete.** No subsequent step has started. No country
pack is published. This record must be updated with actual PR/CI/merge evidence.

| Evidence                           | Value                                                                                                     |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Scope                              | Research structure, 31-jurisdiction coverage matrix, delivery record and explicit Codex verification rule |
| Branch                             | `docs/compliance-1.1-foundations`                                                                         |
| Verified starting base             | `f39fa0e6e5b2e5af2ca8f5a1130a16c411d42c7b` from GitHub master                                             |
| Predecessor                        | None; first step of this plan                                                                             |
| PR / checked head / test-merge SHA | Not yet raised / not yet checked / not yet available                                                      |
| CI checks / review                 | Not yet run / not yet reviewed                                                                            |
| Merge state / commit               | Unmerged / none                                                                                           |
| Next permitted action              | Verify and review 1.1, raise its PR, resolve checks/review and obtain authorized merge; do not start 1.2  |

## Local verification

Checked on 2026-10-13:

- `prettier --check 'docs/NexStepsV2/compliance/*.md'`: passed for all six new
  Markdown files, using the repository-installed Prettier binary from the original
  checkout. Existing rule/index formatting was preserved; only additions inspected.
- `git diff --check`: passed. Reopened all 11 changed/new files and reviewed the
  complete documentation and CSV contents against the approved plan.
- `python3` standard-library CSV/link assertions: passed. Verified 31 unique packs,
  sequential 2.01–2.31 IDs, first five jurisdictions in agreed order, exact EU-27
  country set, 186 unique jurisdiction/sector pairs, all 1,488 cells and 31 regional
  inventories NOT_REVIEWED, 14 relative documentation links resolving, and the
  AGENTS rule/BUILD reference present.
- Fresh independent branch review: structural checks passed; final report pending.
- Reopened DfE registration, DBS employer guidance, ICCE registration and Eurypedia
  discovery sources. Access checks are recorded in SOURCES.md, not legal sign-off.

Runtime typechecks, application lint, unit/integration tests, Prisma validation,
permission-definition checks, builds and desktop/mobile flows are not applicable
to this documentation-only step. No application code, schema, UI or runtime
catalogue is changed. Required repository CI remains a merge gate.

## Decisions and boundaries

- The user-supplied FSS v3 instructions and approved plan govern this delivery.
  The remote base still contains older v2 rule documents. Preserve those files
  except the requested verification addition; preserve the user's unrelated local
  v3 replacements in the original checkout. Do not copy or commit unrelated edits.
- The approved plan's per-step PR/CI/merge gate takes precedence over continuous
  execution guidance. Use this repository-local progress record as the durable
  ledger; do not mark locally verified work complete before merge.
- The requested Codex rule is retained verbatim. Its applicable-check scope means
  persistence/progress/tenant tests apply when those implementations change, not
  to research prose alone. All mandated implementation checks remain in DELIVERY.md.
- Step 1.1 is documentation only. Runtime catalogue schema, taxonomy, migrations
  and feature implementation remain in their later gated steps. No TDD claim is
  made for prose; use structural/format/link checks and a branch review instead.
- Source discovery is not legal review. All 1,488 initial sector/topic coverage
  cells and all regional inventories remain NOT_REVIEWED.

## Subsequent steps

Steps 1.2–1.6 and 2.01–2.31 are **planned, not started**, as specified in
DELIVERY.md and jurisdictions.csv. Before starting each, refresh the host evidence
for its predecessor and record the merged base. UI rollout and production
deployment remain separate from documentation and require their own authorization.

## Evidence recording convention

When raising the PR, replace pending evidence with its real URL and link immutable
head/check runs in the PR record. For each checked revision record the latest head
SHA, required test-merge/queue revision if any, every applicable check conclusion
and required-review state. Do not count absent, pending, skipped or stale checks
as passing. After merge, record GitHub's merged state and actual merge commit here
or in the linked PR record, then carry that evidence into the next step's update.
A pre-merge progress commit cannot prove its own future merge.
