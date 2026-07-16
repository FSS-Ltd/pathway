# ACE Profile — Delivery Plan

> Scope: features gated behind an optional "ACE" profile a school buys on top of NexSteps core —
> the Christian ACE-homeschool-specific domains from the Oasis feature list that don't generalize to
> NexSteps's other verticals (church/club/school/charity).
>
> **Hard dependency:** `nexsteps-global.plan.md` Phase 0 (the org feature-profile toggle system) must
> exist before any item below can be gated per org. Every model/route added here should be built behind
> that toggle from day one, not retrofitted later.
>
> Scoping decision (confirmed): the Merit Wallet + Merit Markets + Merit Shop cluster is fully
> ACE-specific — not split into a generic core feature with an ACE extension.

---

## Phase 1 — PACE Progress & Behaviour (standalone, no cross-dependencies)

**Goal:** the two data domains everything else in this plan reads from.

**Tasks:**
1. **PACE progress tracking** — new `PaceRecord` model: student, subject, PACE number, self-test score,
   final-test score, completion state. Policy fields for daily test limits and warning/block state.
   Staff entry UI in `apps/admin` (and later mobile, once the ACE Student Portal content ships — Phase 3
   here / `nexsteps-global.plan.md` Phase 3 for the shell). No existing PACE/subject/test concept
   anywhere in NexSteps — this is a clean build.
2. **Merit/Demerit behaviour entries** — new `MeritEntry`/`DemeritEntry` models (demerit carries a fixed
   value per policy), riding on top of the existing sensitive/general behaviour-visibility split
   (`ChildNote.visibleToParents` is the closest existing analog — reuse the same RLS/visibility pattern
   rather than reinventing it).

**Output:** staff can record PACE scores and merit/demerit entries per student, gated behind the ACE
profile toggle.

---

## Phase 2 — Merit Wallet

**Goal:** the "biblical money management" ledger everything in Phase 3 depends on.

**Tasks:**
1. New `WalletAccount` model per student with account types: Spend, Saving, Investment, TithePaid,
   Giving.
2. New `LedgerEntry` model — append-only, balanced, audited (follow the same audit pattern as
   `AuditEvent`/`StaffActivity`'s append-only-log shape, even though neither tracks money today).
3. Transfer logic between allowed account pairs (e.g. Spend → Saving, Spend → Giving).
4. Weekly tithe logic — configurable percentage (10/15/20), scheduled calculation debiting Spend into
   TithePaid.
5. Manual tithe payment and charity-giving actions.

**Output:** a student has real Spend/Saving/Investment/Tithe/Giving balances that Merit entries (Phase 1)
feed into and that Phase 3's Shop/Markets debit from.

---

## Phase 3 — Merit Shop & Merit Markets (both depend on the Wallet)

**Goal:** the two spend-side features of the Merit Wallet.

**Tasks:**
1. **Merit Shop** — `ShopItem` model (photos, active state, stock, price, VAT-related pricing),
   shopkeeper counter-purchase flow debiting `WalletAccount` Spend balance and decrementing stock,
   parent/student browse-and-reserve flow, reservation/collection queue, parent-set and tithe-policy
   blocks (reuses the minor-account-controls concept from `nexsteps-global.plan.md` Phase 1's Parent
   Portal).
2. **Merit Markets** — simulated investment-learning experience against the Investment account type:
   portfolio summary, browse/buy/sell review flow, server-side market-data planning (keep provider API
   keys and valuation logic server-side only, never in the client — matches the existing pattern of
   keeping secrets out of `apps/mobile`/`apps/web`). No real brokerage, no real-money returns — clearly
   labelled as educational.
3. **Student wallet actions on mobile/student portal** — the UI layer for Phase 2's ledger and this
   phase's Shop/Markets: Spend/Saving transfer, tithe preference toggle, manual tithe payment, charity
   giving, shop browse/reserve, markets portfolio view. Built inside the Student Portal shell from
   `nexsteps-global.plan.md` Phase 3 (which doesn't exist yet either — sequence accordingly).

**Output:** the full merit economy loop — earn (Phase 1) → hold/tithe/invest (Phase 2) → spend/give
(this phase) — works end to end for a student.

---

## Phase 4 — Faith Corner & ACE-Specific Reporting (depend on everything above)

**Goal:** the content and reporting layer that reads from PACE, Merit, and Wallet data.

**Tasks:**
1. **Faith Corner** — new `FaithContent` model (weekly scripture memory, reflection prompts,
   verse-of-day), admin content management in `apps/admin`, student-facing read/like/comment in the
   Student Portal shell. No existing scripture/devotional concept anywhere in NexSteps — clean build.
2. **ACE-specific ranks & leaderboards** — Top Tithers / Top Investors / Top Savers views, computed from
   Phase 2's `WalletAccount`/`LedgerEntry` data and Phase 1's `PaceRecord` data. Sits alongside (not
   inside) the generic term-report engine from `nexsteps-global.plan.md` Phase 1 — reuse its
   report-snapshot/leadership-review mechanics rather than building a parallel reporting pipeline.
3. **ACE-flavoured homework/activity layer** — PACE-linked scoring hooks and terminology on top of the
   generic assignment engine from `nexsteps-global.plan.md` Phase 3, rather than a second
   homework/activity system.

**Output:** the full ACE profile is feature-complete — an org with the profile enabled sees PACE,
merits/demerits, the wallet, shop, markets, Faith Corner, and ACE-specific ranks throughout admin, web,
and mobile; an org without it sees none of it.

---

### Verification

- Every model in this plan is tenant-scoped with RLS and gated behind the Phase 0 toggle from
  `nexsteps-global.plan.md` — spot-check by creating a test org without the ACE profile and confirming
  none of these routes/nav items/screens are reachable.
- Money-adjacent logic (Wallet, Shop, tithe calculation) needs the same audit-logging rigor as the
  existing `Concern`/`ChildNote` audit coverage — no silent balance changes.
- Re-run `graphify update .` after each phase lands (per this repo's `CLAUDE.md` Graphify gate).
