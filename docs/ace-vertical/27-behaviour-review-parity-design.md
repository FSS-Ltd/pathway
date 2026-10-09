# ACE behaviour stage and review parity contract

**Status:** C08a0 design contract. Oasis is a read-only functional reference.

## Outcome and boundary

ACE staff already record Merit, Demerit, and General facts and correct them
through the site-scoped API, web, and mobile flows. The remaining C08 gap is
the daily demerit stage and manual escalation journey visible in Oasis
(`apps/api/src/routers/behaviour.ts` and
`apps/web/src/components/behaviour/behaviour-log-client.tsx`). NexSteps has a
three-stage policy evaluator, immutable `DemeritStageOverride` storage, and
review-request outbox intents, but no guarded status read or override command.
This contract completes that core journey without coupling behaviour to the
paid Child Merit Market ledger or Clubs records.

Oasis has five stage labels; NexSteps has an approved three-stage policy.
Keep the configured NexSteps thresholds and labels. Do not copy Oasis stage
numbers or derive a balance from the paid merit ledger.

## Access and data rules

- Resolve the current ACE site, active user, child, policy, and site timezone
  on every request. A child from another site, a guest, an inactive staff
  member, or a non-ACE site must receive no stage or review data.
- A staff actor with `ace.behaviour.read` may see General behaviour history.
  A complete demerit status can include facts classified Sensitive, so expose
  the full status and its review context only with
  `ace.behaviour.sensitive.read`. The ordinary capture form remains usable
  without that permission; it must not infer hidden stage totals from a
  partially filtered result. The server remains authoritative for note and
  escalation requirements at save time.
- Creating a manual stage override requires
  `ace.behaviour.policy.manage` and a current fixed site Lead or
  organisation Head assignment. A permission tag alone does not confer this
  high-impact action. The command must reject a stage at or below the
  currently effective stage, require a nonblank reason, and append an
  immutable `DemeritStageOverride` tied to the active policy. Do not edit or
  delete earlier overrides.
- Scope an override to the current site-local day. Store its expiry at the
  next site-local midnight, with a valid timezone and finite timestamp.
  Serialize competing overrides for one child and day, then re-read the
  effective stage inside the transaction so two managers cannot both
  escalate from a stale stage. Audit actor, policy version, stage, child,
  expiry, and reason without putting the reason in guardian notifications.
- Reuse the existing `behaviour.review-requested` outbox intent for Site
  Lead and organisation Head routing. Outbox delivery is not a staff work
  queue: add a site-owned, immutable review-request record with a composite
  site/entry link, kind, stage, policy version, and request time. Create it in
  the same transaction as the intent and make repeats idempotent. A Head or
  Lead with `ace.behaviour.sensitive.read` may read these records within a
  bounded site scope and open the current fact. Validate existing review
  intents for a safe backfill before that view is released. Oasis has no
  review-decision command; do not invent
  approval, dismissal, or case-management states in this slice.

## API and interface slices

1. **C08a1 — status, override, and review reads.** Add a bounded status read
   for one site child and one ISO date, returning policy version, effective
   stage, stage label, action, note requirement, manual stage, expiry, and a
   Head-review indicator. Add an idempotent manual escalation command and
   a bounded Head/Lead review-request read with the access and transaction
   rules above. Keep controllers thin and put the policy calculation in a
   service that reuses `evaluateDemeritStage`.
2. **C08a2 — staff web review.** Add a per-child stage panel to the existing
   behaviour page, with a site-local date, current stage, Head-review notice,
   and a manager-only escalation form. Use the current design tokens and
   keep General/Sensitive history separate. Show loading, no policy, denied,
   conflict, pending, and saved states. The reason is required, and an
   expired or revoked manager role disables the action after refresh.
3. **C08a3 — mobile parity.** Mirror the read and manager action within the
   existing ACE behaviour screen after web verification. Use native controls
   and the established mobile tokens; avoid storing Sensitive review text in
   the persisted behaviour draft.

Each numbered slice gets its own PR and must pass the build-step delivery gate
before the next starts. The existing capture and correction pages continue to
work when there is no active demerit policy.

## Verification, rollout, and rollback

- Test policy thresholds, serious-category promotion, manual stage
  precedence and expiry, site-local midnight and DST, competing managers,
  stale policy/version, correction effects, and no-policy behavior.
- Test current Head/Lead grants, role revocation, tag-only denial,
  inactive-user denial, cross-site denial, Sensitive read denial, and
  guardian/student denial at API and RLS boundaries. Verify the outbox
  routes a Head-review request once and carries no Sensitive note.
- Test keyboard and touch access, screen-reader labels, form validation,
  pending/conflict feedback, and narrow layouts in the web/mobile steps.
  Confirm a permitted Head can find the review request and fact in a signed-in
  journey; CI alone does not prove production identity setup.
- Deploy any additive database change before API and clients. Keep the new
  read and command routes unavailable until their migration is applied.
  A rollback removes the new route/UI and retains immutable facts, overrides,
  and audit records. Track request failures, duplicate-conflict rate, and
  review-delivery errors without logging free-text reasons.
