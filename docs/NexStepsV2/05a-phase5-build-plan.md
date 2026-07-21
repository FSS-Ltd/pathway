# Phase 5 — Detailed build plan (Apple-style configurator + imagery)

**Status:** Planned
**Owner:** Unassigned
**Ships as:** `2.4.0` (tag `v2.4.0`) — see Finding 1; the summary doc's `2.5.0` header is the known stale drift flagged in [`04a-phase4-build-plan.md`](04a-phase4-build-plan.md) Decision D.
**Depends on:** Phase 1 (Vertical/Module enums + capability maps — merged in PRs #176–183), Phase 3 (module checkout line items + generic webhook activation — merged in PRs #191–198), Phase 4 (`Module.LEARNING` + its price codes — merged in PRs #201–207, `master` at `2.3.0`; the modules step sells all nine).
**Blocks:** Phase 6 (cutover removes the old pricing/buy pages once this flow has proven itself).
**Companion to:** [`05-configurator-and-imagery.md`](05-configurator-and-imagery.md) — that doc is the summary; this one pins down the state shape, the step contracts, the motion choreography, and the complete image-generation work order so a build session (and an image-generation session) can execute PR-by-PR with no invention.

---

## Purpose

Ship the dev doc's six-step guided purchase journey (§5: organisation type → vertical → what's included → modules → plan → storage → summary → Stripe Checkout) as a new `/configure` route, plus the imagery system that makes it feel like configuring a product rather than filling in a form.

The experience bar is explicit and is part of the acceptance criteria, not decoration: **model Apple's product configurator, then elevate it.** Apple keeps a static product photo beside the options; this configurator keeps a **live stage** — a composite scene that visibly gains and loses imagery as the customer adds and removes items. Checkout should feel premium and close to enjoyable; every image must read instantly as the thing it represents, with no "what is this meant to be?" pause.

This phase is additive. `/pricing` and `/buy` stay reachable and functional behind a rollout flag; removing them is Phase 6. Nothing here touches entitlements, webhooks, or the API's charge gate.

Two sections below have no equivalent in the other build plans — **Experience specification** and **Imagery art direction + asset prompts**. They exist because this phase's deliverable is as much a design contract as code, and because PR 5.6 (asset production) is executed by an image-generation model that needs verbatim, self-contained prompts rather than references into this repo.

---

## The findings that change this phase

The summary doc was written before the frontend was ground-truthed. Five of its assumptions do not survive contact with the repo.

### Finding 1 — ships as `2.4.0`, not `2.5.0`

[`README.md:70`](README.md) — the index of record for this doc set — lists Phase 5 as `2.4.0` / `v2.4.0`. The summary doc's header still says `2.5.0`, the exact drift 04a's Decision D predicted for Phases 5–7. `master` is at `2.3.0` (Phase 4 shipped in PRs #201–207); this user-facing phase takes the next minor. Fixing the stale headers across the phase docs stays out of scope here, same call as 04a.

### Finding 2 — the stepper cannot live in `packages/ui`

The summary doc's PR 5.1 proposes `packages/ui/src/components/ui/stepper.tsx`. But `apps/web` **does not depend on `@pathway/ui` at all** — its workspace deps are `@pathway/pricing` and `@pathway/util` only ([`apps/web/package.json:17-18`](../../apps/web/package.json)), and no marketing page imports a `packages/ui` primitive; the buy page and the rest of the marketing site are raw Tailwind + `framer-motion`. Putting the stepper in `packages/ui` means adding a workspace dependency to the web app for one component that only the web app uses. See Decision B.

### Finding 3 — the web app cannot render-test; every "render test" in the summary doc must be restated

[`apps/web/jest.config.ts`](../../apps/web/jest.config.ts) is `testEnvironment: "node"` with `ts-jest`. There is no `@testing-library/react`, no jsdom, no render harness anywhere in the app. Existing specs are pure-logic tests over `lib/` functions ([`learning-module-pricing.spec.ts`](../../apps/web/__tests__/learning-module-pricing.spec.ts)) and source-text assertions over page files (the `buy-page-*.spec.ts` family). Every failing-test-first below is therefore a **pure-function test or a source-text test**, never a mounted component. This is the same discipline the admin app already accepted for its nav tests (04a PR 4.5).

### Finding 4 — module display metadata does not exist in the web app, and the cart math models exactly one module

Four grounded gaps, all in the way of the modules step:

- Module **labels** exist only in `apps/admin` ([`api-client.ts:483-492`](../../apps/admin/lib/api-client.ts), `MODULE_LABELS`, 8 entries, `LEARNING` missing — the hand-maintained duplicate 04a's Open Decision 6 already flagged). `apps/web` has none.
- Module **descriptions** exist nowhere in the repo. The only descriptive copy is the buy page's Learning aside. The dev doc's step 4 requires "description, monthly price, and included features" per module. This doc supplies the descriptions (§Imagery, alongside each image prompt).
- [`BuyNowSelection`](../../apps/web/lib/buy-now-pricing.ts) (`:140-147`) models modules as a single `learningModule?: boolean`, and [`BuyNowCheckoutPayload.selectedModules`](../../apps/web/lib/buy-now-client.ts) (`:60`) is typed `Array<"LEARNING">`. The modules step needs both generalised to all nine.
- `calculateCartTotals` (`buy-now-pricing.ts:156`) prices Learning by name (`:206-214`). Generalising this is PR 5.1, and the old buy page must keep passing its existing specs untouched.

### Finding 5 — only price-mapped modules can check out, and the UI must mirror that

The API rejects any selected module without a `STRIPE_PRICE_MAP` entry (`assertSelectedModulesCanBeCharged`, [`buy-now.service.ts`](../../apps/api/src/billing/buy-now.service.ts)). Client-side, only Learning has fallback prices; live amounts arrive per code via `fetchPublicBillingPrices` ([`buy-now-client.ts:175`](../../apps/web/lib/buy-now-client.ts)) and `mergeBillingPrices` (`buy-now-pricing.ts:226`). The other eight modules have no Stripe Products yet — that is a commercial decision, not a code task (same shape as 04a PR 4.6's operational half). So the modules step **derives purchasability from the live price data**: a module with no live (or fallback) price renders as "Coming soon", visible but not selectable. The UI never offers what the API would reject. See Decision E.

### Finding 6 — the app is light-scheme only, which resolves the summary doc's Open Decision 3

[`globals.css:6`](../../apps/web/app/globals.css) declares `color-scheme: light` and defines a single `--pw-*` token block; there is no dark-mode variable set anywhere. One light-variant asset set is correct today. Because every asset is a transparent-background PNG composited onto a token-driven backdrop (Decision F), adding dark variants later is an asset drop plus a token change, not a structural one.

---

## Decisions locked (grounded)

**A. Ships as `2.4.0`** (Finding 1).

**B. All configurator code lives in `apps/web` — no `packages/ui` change, no new workspace dependency.**
Route code in `apps/web/app/configure/`, shared pieces in `apps/web/components/configurator/`, pure logic in `apps/web/lib/`. This matches where every marketing-surface component already lives (`components/product-showcase.tsx`, `components/hero/`). If the admin app ever wants the stepper, lift it then — the same third-consumer rule as 04a Decision G.

**C. One module catalogue file: `apps/web/lib/module-catalog.ts`.**
A `Record` over the nine module names carrying `label`, `description`, `imagePath`, `imageAlt`, and the two price codes. Single source for the modules step, the stage, the summary, and the asset-existence test. It does **not** import from `apps/admin` (apps cannot import each other's source) nor from `@pathway/platform` at runtime (that package depends on `@pathway/db` and its maps type against `@prisma/client` — [`capability-maps.ts:1`](../../packages/platform/src/capability-maps.ts) — which must not enter the marketing bundle). A **test-time** relative import keeps the catalogue honest instead: the completeness spec asserts its keys equal `Object.keys(MODULE_CAPABILITIES)`, so the tenth module breaks this catalogue loudly, the drift-protection `AdminModule` never had.

**D. `@pathway/types` joins `apps/web`'s dependencies; vertical data is never duplicated.**
[`packages/types/src/vertical.ts`](../../packages/types/src/vertical.ts) exists precisely for this — its own header says it stays dependency-free "for frontend use". The vertical step renders `VERTICAL_OPTIONS`; labels come from `VERTICAL_LABELS`. Nothing vertical-shaped is hand-copied into the web app.

**E. The modules step sells only what the backend would charge** (Finding 5). Purchasability per module = a live price for the current billing interval exists after `mergeBillingPrices`, or a client fallback exists (today: Learning only). Everything else renders "Coming soon", unselectable, at the end of the list. When ops maps a module's Stripe prices, it becomes purchasable with **zero frontend changes**.

**F. Imagery is transparent-background PNG hero objects composited onto a token-driven backdrop** (user-approved art direction: soft 3D renders; full 19-asset set). The stage's background comes from CSS tokens, not baked into the images — which is what makes crossfades clean, the summary composite possible, and Finding 6's future dark variant an asset swap.

**G. One route, no per-step URLs.** `/configure` is a single client page; the current step lives in component state, driven by pure functions in `state.ts`. Guarding "jumped ahead without a prerequisite" becomes a pure `firstIncompleteStep(state)` check rather than URL/state synchronisation. Deep-linking into a half-completed purchase has no requirement behind it; flagged as an open decision rather than pre-built.

**H. Organisation type auto-resolves where it can.** Dev-doc §5 step 1 lists five organisation types (School, Church, Charity, Club, Nursery); step 2 narrows School to the school verticals. Church, Charity, Club, and Nursery each map to exactly one `Vertical`, so for them the vertical step auto-resolves and is skipped — four of five customers get a five-screen flow instead of six, which is the kind of respect for the customer's time the premium bar demands. School shows the narrowing screen (Independent / ACE / State). The dev doc's "E.g." sentence lists Nursery among School's narrowings *and* as a top-level type; this plan takes the top-level reading since `NURSERY` is a first-class `Vertical`, and flags it (Open Decision 4).

**I. The account form lives on the summary step.** The dev doc never says where org name, contact, password, and sector go; the checkout payload requires them ([`BuyNowCheckoutPayload`](../../apps/web/lib/buy-now-client.ts) `:51-63`). Apple asks for your details after you've built the thing you want, and interrupting the configuration with a form would break the flow this phase exists to create. The summary step carries the same fields the buy page collects today, verbatim, for payload parity. The legacy `sector` field is derived, never asked: a pure `verticalToSector()` maps the seven verticals onto the four-value `Sector` union (`CHURCH→CHURCH`, `CLUB→CLUB`, `CHARITY→CHARITY`, all schools and nursery→`SCHOOL`).

**J. Billing frequency is a monthly/yearly segmented control on the plan step**, where the prices it changes are on screen — not a global toggle floating above the flow.

**K. Rollout flag is a single env var, `NEXT_PUBLIC_USE_CONFIGURATOR`** — resolves the summary doc's Open Decision 2. Grounded there already: no flag service exists in this codebase, and this is rollout flagging (dev-doc §12 "Do"), never entitlement flagging (§12 "Don't").

**L. Phase 5 ends with a bump-to-`2.4.0` PR** (root `package.json` + `packages/util/src/version.ts`), the same release discipline as 04a Decision H. The summary doc listed no bump PR; the README's versioning section requires one.

---

## Experience specification

This section is the design contract PRs 5.2–5.5 build against and the review bar PR 5.6's assets are judged by. It is written once, here, so "premium" is a checkable claim instead of a vibe.

### Layout — the stage is the product

Desktop (`lg:`): a two-pane grid, `grid-cols-[minmax(0,1fr),minmax(400px,44%)]`.

- **Left pane** — the current step's content: heading, one-line explainer, option cards. Max width `max-w-xl`; scrolls naturally.
- **Right pane** — the **stage**, `sticky top-24`: a rounded panel (`rounded-2xl`, `shadow-card`, backdrop `bg-muted` from tokens) containing the live composition — the chosen vertical's diorama as the backdrop scene, and a shelf grid beneath it holding one hero object per selected add-on (modules + storage). Under the stage: the running total (animated), the line items, and a caption line ("Independent School · Growth · billed monthly").

Mobile: the stage collapses to a compact horizontal strip pinned above the step content (backdrop thumbnail + object row + total); same components, one layout branch.

The stage is the elevation over Apple. Apple's configurator shows a photo of the product you're buying; this product is intangible, so the stage **builds a visible object out of your choices**. Nothing on it is ornamental: every image maps 1:1 to a line item or the chosen vertical, which is what makes the imagery self-explanatory.

### Motion vocabulary — one file, `apps/web/lib/motion.ts`

Every duration, easing, and spring in the configurator comes from these exported constants. No motion literal appears in a component.

| Constant | Value | Used for |
|---|---|---|
| `springEnter` | `{ type: "spring", stiffness: 260, damping: 22 }` (~350ms settle) | objects landing on the stage; step-forward content |
| `exitEase` | `{ duration: 0.2, ease: "easeOut" }` | objects leaving the stage; step-back content |
| `backdropFade` | `{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }` | vertical backdrop crossfade |
| `staggerChildren` | `0.05` | option cards entering on a new step |
| `settleZoom` | scale keyframes `[1, 1.02, 1]`, `0.45s` | the stage acknowledging a step advance |
| `totalTick` | `{ duration: 0.4, ease: "easeOut" }` | running-total number animation |

### Selection choreography — the contract

1. **Add-on toggled on:** its hero object mounts into the stage shelf — `initial {opacity 0, scale 0.85, y: -12}` → `animate {opacity 1, scale 1, y: 0}` with `springEnter`; sibling objects reflow via framer-motion `layout`. Simultaneously the option card's price chip and the running total tick up with `totalTick`, and a line item slides into the list.
2. **Add-on toggled off:** `AnimatePresence` exit — `{opacity 0, scale 0.9}` with `exitEase`. No bounce. The asymmetry is deliberate: additions celebrate, removals get out of the way. Nothing else on the stage moves except the `layout` reflow.
3. **Vertical changed:** the backdrop crossfades with `backdropFade` — both images mounted and absolutely positioned during the transition (`AnimatePresence mode="sync"`), transparent PNGs over the token backdrop so nothing flashes. Selected module objects persist on the shelf, untouched, through the swap.
4. **Storage changed:** the shelf's single storage slot crossfades between puck images (`exitEase` out, `springEnter` in). Capacity reads as stack height (§Imagery), so the swap itself communicates the change.
5. **Plan changed:** no stage object — a plan is not a thing you own. The caption line crossfades and the total ticks. Restraint here is what keeps the stage's grammar honest: object = line item you add, caption = configuration.
6. **Step forward:** outgoing content `x: -24`, fade; incoming `x: 24 → 0` with `springEnter`, option cards staggered by `staggerChildren`; the stage plays `settleZoom` once.
7. **Step back:** mirrored at `0.25s`, no zoom. Going back should feel lighter than going forward.
8. **Running total:** the number animates through intermediate values via a framer-motion motion value (`animate(motionValue, next, totalTick)`); line items are an `AnimatePresence` list with `layout`.
9. **Reduced motion:** `useReducedMotion()` (already the house pattern — [`product-showcase.tsx:58`](../../apps/web/components/product-showcase.tsx)) collapses crossfades to instant swaps, springs to `0.15s` fades, and disables `settleZoom` and stagger. The flow must feel complete, not degraded, with motion off.

### Price honesty

Every selectable option carries a delta chip — "+£29/mo", "+£290/yr", "Included", or "Coming soon" — computed from the **same** merged price data (`mergeBillingPrices` over `fetchPublicBillingPrices`, fallbacks beneath) that feeds `calculateCartTotals`. A chip can never disagree with the total. Apple never makes you do arithmetic; neither does this.

### Performance

- All 19 stage PNGs are preloaded when `/configure` mounts (`<link rel="preload" as="image">` for the off-screen set; `next/image` `priority` on the visible backdrop), so no selection ever pops in an unloaded image.
- Hero objects render at fixed shelf-cell sizes (~96–128px), backdrops `fill` inside an `aspect-[3/2]` container with `sizes` set — the [`product-showcase.tsx`](../../apps/web/components/product-showcase.tsx) `next/image` conventions.

---

## Imagery art direction and asset prompts

This section is **PR 5.6's complete work order**, written to be pasted verbatim, one prompt at a time, into an image-generation model. User-approved direction: soft 3D render hero objects, full 19-asset set.

### Master style block

Every prompt below begins with this paragraph, exactly:

> Soft 3D render, single subject floating against a fully transparent background. Matte ceramic and soft-touch plastic materials with subtle brushed-aluminium accents. Primary accent colour teal (#17B89E) on one or two deliberate surfaces of the subject; warm amber (#F7CA68) as one small secondary highlight. Soft diffuse studio lighting from the upper left, gentle ambient occlusion, and a soft contact shadow directly beneath the subject. Camera at a gentle three-quarter angle, slightly elevated, 50mm-equivalent perspective with minimal distortion. Rounded, friendly geometry throughout — consistent corner radii, no sharp edges. No text, no letters, no numbers, no logos, no people, no faces. The subject fills roughly 70% of the frame.

Modules and storage: append "Square 1:1 canvas, 1024×1024, PNG with transparency."
Verticals: append "The subject is a miniature architectural diorama resting on a small rounded ground plane. Landscape 3:2 canvas, 1536×1024, PNG with transparency."

### File convention

```
apps/web/public/configurator/
  modules/{finance,events,transport,meals,asset-management,hr,ai-workspace,advanced-reporting,learning}.png   1024×1024
  storage/{storage-100gb,storage-200gb,storage-1tb}.png                                                       1024×1024
  verticals/{church,independent-school,ace-school,state-school,nursery,charity,club}.png                      1536×1024
```

Slugs are the kebab-case of the enum value, derived by a pure `moduleImagePath()` / `verticalImagePath()` in the catalogue — the asset-existence test (PR 5.4) walks exactly these paths.

### Module images — nine prompts, with the descriptions the repo is missing

Each entry: the catalogue `label`, the customer-facing `description` (net-new copy — Finding 4; also the image's `alt` text base), and the prompt's subject paragraph (append to the master block).

**1. Finance** — *"Invoices, payments and financial reporting for your organisation."*
> Subject: an open ledger book with cream pages and a teal cover, lying at a slight angle. Resting on its right page, a short stack of three oversized coins in brushed aluminium, each with a thin teal edge inlay. Leaning against the book's spine, a small rounded calculator with a soft-white body and a single amber key. The composition reads instantly as "money, recorded and in order".

**2. Events** — *"Plan, publish and manage sign-ups for services, sessions and events."*
> Subject: a chunky desk calendar standing upright, one page caught mid-flip, with a single date cell marked by a raised teal rounded square. Tucked against its base, one admission ticket with a perforated edge and an amber stub. The composition reads as "a date worth circling".

**3. Transport** — *"Routes, vehicles and passenger lists for trips and daily runs."*
> Subject: a rounded, toy-like minibus in soft white with a teal waistline stripe and light-grey windows, angled three-quarters towards the camera. Floating just above its roof, a teal map pin with a small amber dot at its centre. Friendly, safe, unmistakably "the minibus".

**4. Meals** — *"Menus, dietary needs and meal counts, planned in one place."*
> Subject: a rounded rectangular lunch tray in soft teal holding a white plate with a subtle amber rim and a glossy red-amber apple. Stubby rounded cutlery rests in the tray's side channel. The composition reads as "lunchtime, organised".

**5. Asset Management** — *"Track equipment and resources — what you own, where it is, who has it."*
> Subject: a sturdy storage crate in soft grey with rounded teal corner guards, its lid slightly ajar. Propped against its front, a clipboard holding a blank card with three teal checklist tick-shapes (shapes only, no writing). On the crate's front face, one small amber square tag suggesting a scannable label. Reads as "kit, accounted for".

**6. HR** — *"Staff records, roles and onboarding for your team and volunteers."*
> Subject: an ID badge on a teal lanyard, draped over a neat stack of two soft-grey folders. The badge face carries an abstract circular avatar shape in teal and a thin amber band across its base — no portrait, no text. Reads as "your team, welcomed".

**7. AI Workspace** — *"Drafting, summarising and admin assistance, built into your workspace."*
> Subject: an open notebook with softly lit blank pages, and a small luminous teal orb hovering just above it, trailing three tiny amber sparks. The orb casts a gentle teal glow onto the pages. This is the only image in the set with any self-illumination — keep every other material matte so the glow stays special.

**8. Advanced Reporting** — *"Deeper analytics, trends and exportable reports across your data."*
> Subject: three rounded vertical bars arranged like a podium — the tallest in teal, the middle in brushed aluminium, the shortest in soft white with an amber cap. A rounded magnifying glass leans against the tallest bar, its lens catching one soft highlight. Reads as "the numbers, understood".

**9. Learning** — *"Log learning activity, attach evidence and generate progress reports."*
> Subject: a graduation cap with an amber tassel resting on an open book with a teal cover. A rounded pencil lies diagonally across the open pages. Reads instantly as "learning, recorded".

### Storage images — one design, capacity as stack height

The three share one puck design so the family reads as a scale; the swap animation (§choreography 4) then communicates capacity by itself.

**100GB** (`storage-100gb.png`)
> Subject: a single rounded storage drive puck — soft-white top surface, brushed-aluminium side ring, one thin teal light strip along the front edge (unlit, matte). Reads as "a tidy unit of space".

**200GB** (`storage-200gb.png`)
> Subject: two identical rounded storage drive pucks in a neat stack, the top one offset a few degrees, with a single small amber dot on the top puck's front ring. Same puck design as the 100GB image.

**1TB** (`storage-1tb.png`)
> Subject: a tower of five identical rounded storage drive pucks stacked with a slight helical twist, the topmost puck capped in teal. Same puck design as the other storage images; the height alone reads as "serious capacity".

### Vertical images — seven diorama backdrops

These sit behind the shelf as the stage's scene, so they are calmer than the module objects: wider framing, softer accent use, nothing competing with the foreground.

**Church** (`church.png`)
> Subject: a small chapel with a pitched roof and a modest steeple, tall arched windows glazed in warm amber, and a teal front door. A low rounded hedge on the ground plane. Quiet, welcoming, unmistakably a church.

**Independent School** (`independent-school.png`)
> Subject: an elegant symmetrical two-storey schoolhouse with a small portico entrance, teal double doors, and a blank shield-shaped crest above them (shape only, no marks). Two rounded trees flank the building on the ground plane.

**ACE School** (`ace-school.png`)
> Subject: a modest single-storey schoolhouse with a small bell gable (bell as a simple rounded silhouette). Beside the entrance, a neat stack of three slim workbooks with alternating teal and amber covers. Homely and studious.

**State School** (`state-school.png`)
> Subject: a friendly wide brick school building with a generous entrance, teal window frames, and a blank clock-face circle above the doors (no numerals, no hands). A simple rounded railing along the ground plane's front edge.

**Nursery** (`nursery.png`)
> Subject: a soft-cornered single-storey building with an amber awning over the door. On the ground plane beside the entrance: three oversized stacking blocks (teal, white, aluminium) and a small teal ball. Playful without clutter.

**Charity** (`charity.png`)
> Subject: a rounded community hall with open double doors and a simple heart-shaped sign hanging above them. Beside the entrance, a small collection box with a teal heart on its front. Open and generous.

**Club** (`club.png`)
> Subject: a small sports pavilion with a veranda, flying a teal pennant flag from the roof ridge. On the ground plane in front: a white football with aluminium panel seams and a small amber whistle. Energetic but tidy.

### Set-consistency checklist (PR 5.6's review gate)

Judged across the whole set, on the stage's token backdrop and on a plain amber swatch:

- [ ] Light direction identical (shadows fall lower-right from upper-left light) in all 19.
- [ ] Teal appears on one or two surfaces per image, amber on exactly one; neither dominates.
- [ ] Subject fills ~70% of frame in all objects; dioramas share a consistent ground-plane size.
- [ ] Zero text, numerals, logos, faces, or people anywhere (zoom in on badges, tickets, clock, crest).
- [ ] Transparency is clean — no white fringing when composited on the amber swatch.
- [ ] The five-second read test: someone who has never seen the product names what each module image represents, unprompted.

---

## Grounded references (read once before starting)

| Purpose | Real file / anchor |
|---|---|
| Six-step journey definition | `docs/NexStepsV2/nexsteps-platform-architecture-dev-doc.md:165-178` (§5 "Purchase journey") |
| Version index of record (`2.4.0`) | `docs/NexStepsV2/README.md:63-73` |
| Buy page — the parity contract | `apps/web/app/buy/page.tsx:50-67` (state), `:101-109` (selection build), `:210-224` (checkout body) |
| Checkout payload type (`selectedModules: Array<"LEARNING">` to widen) | `apps/web/lib/buy-now-client.ts:51-63` |
| `createCheckoutSession` / `previewPlanSelection` / `fetchPublicBillingPrices` | `apps/web/lib/buy-now-client.ts:117`, `:85`, `:175` |
| Legacy `Sector` union (`verticalToSector` target) | `apps/web/lib/buy-now-client.ts:14` |
| Cart math + price metadata to generalise | `apps/web/lib/buy-now-pricing.ts:36` (`PLAN_PRICES`), `:81` (`ADDON_PRICES`), `:140-147` (`BuyNowSelection`), `:156` (`calculateCartTotals`), `:226` (`mergeBillingPrices`) |
| Vertical union + labels + options (add `@pathway/types` dep) | `packages/types/src/vertical.ts` |
| Capability maps (test-time parity only — imports `@prisma/client`) | `packages/platform/src/capability-maps.ts:1`, `:7` (`VERTICAL_CAPABILITIES`), `:60` (`MODULE_CAPABILITIES`) |
| Admin's module labels (do **not** import; drift warning 04a OD6) | `apps/admin/lib/api-client.ts:483-492` |
| Backend charge gate the UI mirrors | `apps/api/src/billing/buy-now.service.ts` (`assertSelectedModulesCanBeCharged`) |
| Module price-code pattern | `apps/api/src/billing/billing-provider.config.ts:14-32` |
| Motion + `next/image` house conventions | `apps/web/components/product-showcase.tsx:3-4` (imports), `:58` (`useReducedMotion`) |
| Brand tokens (stage backdrop, accents) | `apps/web/app/globals.css:5-27` |
| Trial-wizard TODO — read before PR 5.2, don't build against | `apps/web/app/(marketing)/trial/trial-page-client.tsx:17-24` |
| Web jest reality (node env, no render tests) | `apps/web/jest.config.ts` |
| Pure-logic spec template | `apps/web/__tests__/learning-module-pricing.spec.ts` |
| Plan catalogue (plan step copy source) | `packages/pricing/src/catalog.ts:7` (`PLANS`) |
| Version bump targets | root `package.json`, `packages/util/src/version.ts` (both `2.3.0`) |

---

## Conventions every PR follows

- **One branch per PR**, lowercase commit subject (commitlint), PRs target `FSS-Ltd/pathway`. No AI attribution anywhere. Stacked 5.1 → 5.7.
- **TDD**, with Finding 3's restatement: tests are pure-function or source-text, never mounted renders.
- **No new dependencies.** `framer-motion`, `next/image`, `jest`, and `@pathway/types` (workspace) cover everything; a PR adding a package to `apps/web` is out of shape.
- **Motion constants only from `lib/motion.ts`** (PR 5.4 lands it); a duration literal inside a component is a review flag.
- **The UI never decides entitlements.** It displays what the merged price data offers; the API's charge gate remains the authority (Finding 5).
- **After each code PR:** `graphify update .` (repo CLAUDE.md gate).

---

## PR ordering (dependency-correct)

The summary doc sketched five PRs; this plan renumbers to seven — the catalogue/cart generalisation deserved its own lib-only PR (5.1), and the release bump was missing (5.7). Mapping: spec 5.1→5.2, 5.2→5.3, 5.3→5.4, 5.4→5.5, 5.5→5.6.

| PR | Branch | Scope one-liner |
|---|---|---|
| 5.1 — module catalogue + cart generalisation | `feat/phase5-module-catalog` | `module-catalog.ts`, `selectedModules` in cart math + payload types |
| 5.2 — configurator state machine + stepper shell | `feat/phase5-configurator-shell` | `/configure` route, `state.ts`, stepper chrome, placeholder screens |
| 5.3 — step screens + running total | `feat/phase5-configurator-steps` | six steps' real content, price chips, animated total |
| 5.4 — the stage: imagery system + transitions | `feat/phase5-configurator-stage` | stage composite, `motion.ts`, choreography, placeholder assets |
| 5.5 — summary → Stripe Checkout handoff + flag | `feat/phase5-checkout-handoff` | payload mapping, `verticalToSector`, `NEXT_PUBLIC_USE_CONFIGURATOR` |
| 5.6 — imagery asset production | `chore/phase5-configurator-assets` | the 19 final PNGs per §Imagery; review gate = consistency checklist |
| 5.7 — version bump `2.4.0` | `chore/phase5-version-2.4.0` | release |

5.6 can run in parallel from the moment 5.4 fixes the asset paths; it blocks nothing.

> Code blocks below are verbatim targets. "Mirror X" means copy an existing file's shape exactly.

---

## PR 5.1 — Module catalogue + cart generalisation

**Scope:** everything the configurator needs from `lib/`, with zero UI. The old buy page's behaviour is untouched and its existing specs must pass unmodified — that is this PR's regression contract.

**Key files:**
- `apps/web/lib/module-catalog.ts` (N) — Decision C. Shape:

```ts
export type WebModule =
  | "FINANCE" | "EVENTS" | "TRANSPORT" | "MEALS" | "ASSET_MANAGEMENT"
  | "HR" | "AI_WORKSPACE" | "ADVANCED_REPORTING" | "LEARNING";

export type ModuleCatalogEntry = {
  label: string;
  description: string;      // §Imagery copy, verbatim
  imagePath: string;        // `/configurator/modules/${slug}.png`
  imageAlt: string;
  priceCodes: { monthly: string; yearly: string }; // MODULE_<NAME>_<INTERVAL>
};

export const MODULE_CATALOG: Record<WebModule, ModuleCatalogEntry> = { /* nine entries */ };
export function moduleImagePath(module: WebModule): string { /* kebab slug */ }
```

- `apps/web/lib/buy-now-pricing.ts` (E) — `BuyNowSelection` gains `selectedModules?: WebModule[]`; `calculateCartTotals` normalises `learningModule: true` into `selectedModules` at entry (one line), then prices each selected module from the merged price data by its `MODULE_<NAME>_<interval>` code, skipping any module with no price (Finding 5 — the total and the "Coming soon" chip must agree by construction). `mergeBillingPrices` (`:226`) gains a `modulePrices` output keyed by module price code so live Stripe amounts flow to all nine, not just the codes already in `ADDON_PRICES`.
- `apps/web/lib/buy-now-client.ts` (E) — `BuyNowCheckoutPayload.selectedModules` widens from `Array<"LEARNING">` to `WebModule[]` (`:60`). Type-only; the API already normalises and validates server-side.
- `apps/web/package.json` (E) — add `"@pathway/types": "workspace:*"` (Decision D).

**Failing test first:** `apps/web/__tests__/module-catalog.spec.ts` (N), mirroring `learning-module-pricing.spec.ts`'s pure style:
- completeness — `Object.keys(MODULE_CATALOG)` equals `Object.keys(MODULE_CAPABILITIES)` via a **test-time** relative import of `packages/platform/src/capability-maps` (Decision C), so module #10 fails this file the day it lands;
- every entry has a non-empty description, an `imagePath` matching the kebab convention, and price codes matching `billing-provider.config.ts`'s `MODULE_<NAME>_<INTERVAL>` pattern;
- **parity** — `calculateCartTotals({ …, learningModule: true })` deep-equals `calculateCartTotals({ …, selectedModules: ["LEARNING"] })`, and both still equal the existing spec's £78 expectation;
- a module with no mapped price contributes no line and no total change.

**Rollback:** revert the four files. Nothing renders from the catalogue yet.

---

## PR 5.2 — Configurator state machine + stepper shell

**Scope:** the `/configure` route, its state container, and the stepper chrome, with placeholder step bodies. Read the trial-wizard TODO ([`trial-page-client.tsx:17-24`](../../apps/web/app/(marketing)/trial/trial-page-client.tsx)) before starting — Open Decision 1 stays open, but the state shape below deliberately keeps org details out of early steps so the two flows could later share a shell without a data fight.

**Key files:**
- `apps/web/app/configure/page.tsx` (N) — `"use client"` like every marketing surface; hosts the reducer and the two-pane layout skeleton.
- `apps/web/app/configure/state.ts` (N) — pure, no React:

```ts
export type OrgType = "SCHOOL" | "CHURCH" | "CHARITY" | "CLUB" | "NURSERY";
export type ConfiguratorStep =
  | "org-type" | "vertical" | "included" | "modules" | "plan" | "storage" | "summary";

export type ConfiguratorState = {
  step: ConfiguratorStep;
  orgType: OrgType | null;
  vertical: Vertical | null;          // auto-resolved for four of five org types (Decision H)
  selectedModules: WebModule[];
  planCode: PlanCode | null;
  frequency: "monthly" | "yearly";
  storageChoice: "none" | "100" | "200" | "1000";  // buy page's exact domain, page.tsx:53
};

export function nextStep(state: ConfiguratorState): ConfiguratorState;
export function prevStep(state: ConfiguratorState): ConfiguratorState;
export function firstIncompleteStep(state: ConfiguratorState): ConfiguratorStep; // Decision G guard
export function verticalsForOrgType(orgType: OrgType): Vertical[];               // Decision H mapping
```

- `apps/web/components/configurator/stepper.tsx` (N) — progress indicator + back/continue, raw Tailwind on brand tokens (Decision B). Steps that auto-resolve (Decision H) never appear in the indicator, so a Church admin sees five dots, not six with one skipped.

**Failing test first:** `apps/web/__tests__/configurator-state.spec.ts` (N), pure:
- forward/back traversal preserves every prior selection;
- `nextStep` from `org-type` skips `vertical` exactly when `verticalsForOrgType` has one entry, and auto-fills `state.vertical`;
- a state whose `step` is beyond `firstIncompleteStep` (e.g. `plan` with `vertical: null`) is redirected back by the guard, never rendered blank;
- `verticalsForOrgType` covers all five org types and its outputs partition all seven `Vertical` values.

**Rollback:** delete the route and the two new files; nothing else references them.

---

## PR 5.3 — Step screens + running total

**Scope:** real content for every step, the price chips, and the animated running total. This is where the flow starts feeling like a product; the stage itself waits for PR 5.4.

**Key files:**
- `apps/web/app/configure/steps/org-type.tsx`, `vertical.tsx`, `included.tsx`, `modules.tsx`, `plan.tsx`, `storage.tsx`, `summary.tsx` (all N) — one file per step. Option cards follow the buy page's card idiom (rounded, `border-pw-border`, teal selected ring) so the marketing site stays one visual family.
  - `org-type` / `vertical`: cards from Decision H's mapping and `VERTICAL_OPTIONS`; labels only from `VERTICAL_LABELS`.
  - `included`: the chosen vertical's included features as short customer-readable bullets — copy lives in a `VERTICAL_FEATURES: Record<Vertical, string[]>` block in `module-catalog.ts` (E), translated mechanically from `VERTICAL_CAPABILITIES` ("attendance.manage" → "Attendance registers"); the parity test asserts key coverage, not prose.
  - `modules`: one card per `MODULE_CATALOG` entry — label, description, delta chip; purchasable modules first, "Coming soon" entries last and unselectable (Decision E).
  - `plan`: the four tiers from `PLANS` with Active-People allowances, Decision J's frequency control, Enterprise routing to contact exactly as the buy page gates it (`page.tsx:183`).
  - `storage`: the three tiers as cards (not the buy page's `<select>` — cards carry the puck imagery in 5.4), same `"none" | "100" | "200" | "1000"` domain.
  - `summary`: the full readback plus Decision I's account form — the buy page's exact fields.
- `apps/web/components/configurator/running-total.tsx` (N) — wraps `calculateCartTotals` with the merged live prices; renders the animated number, the line-item list, and the caption line. Also calls `previewPlanSelection` on plan/storage change and surfaces the entitlement preview on the summary step, exactly as the buy page does.
- `apps/web/components/configurator/price-chip.tsx` (N) — one tiny component so "+£29/mo" / "Included" / "Coming soon" logic exists exactly once, driven by a pure `optionDelta()` helper in `module-catalog.ts`.

**Failing test first:** extend `module-catalog.spec.ts` and add `apps/web/__tests__/configurator-steps.spec.ts` (N):
- pure — `optionDelta()` returns the same amount `calculateCartTotals` would add for that toggle, for every module and storage tier, both intervals (the chip-never-disagrees-with-the-total guarantee, proven exhaustively);
- pure — `VERTICAL_FEATURES` covers all seven verticals;
- source-text (the `buy-page-*.spec.ts` idiom) — `modules.tsx` maps over `MODULE_CATALOG` (no hand-listed module), `vertical.tsx` imports `VERTICAL_OPTIONS`, and no step file contains a `£` literal (all money flows from price metadata).

**Rollback:** revert the step files; the 5.2 shell still runs with placeholders.

---

## PR 5.4 — The stage: imagery system + transitions

**Scope:** the sticky stage composite, the motion vocabulary, the selection choreography, and 19 placeholder assets at the final paths. After this PR the configurator *feels* finished; only the art is temporary.

**Key files:**
- `apps/web/lib/motion.ts` (N) — the §Motion vocabulary table, verbatim, as exported constants.
- `apps/web/components/configurator/stage.tsx` (N) — backdrop layer (`AnimatePresence` crossfade per choreography 3), shelf grid (`layout` reflow, `springEnter`/`exitEase` per choreography 1–2), storage slot (choreography 4), caption line (choreography 5), `settleZoom` hook (choreography 6), all behind `useReducedMotion` (choreography 9). Images via `next/image` per the `product-showcase.tsx` conventions; preloading per §Performance.
- `apps/web/app/configure/page.tsx` (E) — mounts the stage in the right pane; mobile strip variant.
- `apps/web/public/configurator/**` (N) — 19 placeholder PNGs at the exact §File-convention paths: one flat rounded-square in brand teal exported once and copied per path. Low-fidelity is the point; the paths are the contract.

**Failing test first:** `apps/web/__tests__/configurator-assets.spec.ts` (N) — runs in the node test env, which is exactly what it needs:
- for every `MODULE_CATALOG` entry, every storage tier, and every `Vertical`, the derived image path exists on disk under `apps/web/public` (`fs.existsSync`) — the asset-existence test the summary doc asked for, and the test that makes PR 5.6 a pure file-swap;
- source-text — `stage.tsx` imports its transition values from `lib/motion` and contains no inline `duration:` literal;
- source-text — `stage.tsx` references `useReducedMotion`.

**Rollback:** revert the stage component and assets; PR 5.3's steps render correctly without a stage, just plainer.

---

## PR 5.5 — Summary → Stripe Checkout handoff + rollout flag

**Scope:** the configurator produces the same checkout the buy page would for equivalent selections — regression parity, not "it doesn't crash" — behind the rollout flag.

**Key files:**
- `apps/web/lib/configurator-checkout.ts` (N) — a pure `buildCheckoutPayload(state, org): BuyNowCheckoutPayload` mapping the configurator state onto the exact body shape the buy page builds (`page.tsx:210-224`): `planCode`, storage quantities from `storageChoice`, `selectedModules` (omitted when empty, matching `:216`'s `undefined`), org fields, and `sector` from `verticalToSector()` (Decision I) — the seven-to-four mapping lives here with the payload it exists for.
- `apps/web/app/configure/steps/summary.tsx` (E) — calls `createCheckoutSession(buildCheckoutPayload(…))` with the buy page's loading/error handling idiom; success/cancel URLs point at the existing `/buy/thanks` and `/buy/cancelled`.
- `apps/web/components/header-nav.tsx` (E) plus any other pricing CTA source (`footer.tsx`, `home-cta-section.tsx` — grep `"/pricing"|"/buy"` across `apps/web` before editing) — CTAs point at `/configure` when `NEXT_PUBLIC_USE_CONFIGURATOR === "true"`, else at the current funnel (Decision K). `/pricing` and `/buy` themselves change **zero lines** — the flag redirects attention, it deletes nothing (that's Phase 6).

**Failing test first:** `apps/web/__tests__/configurator-checkout.spec.ts` (N), pure:
- for a fixture of equivalent selections (Starter monthly + Learning + 100GB; Professional yearly, no modules; Growth monthly + 1TB), `buildCheckoutPayload` deep-equals the literal body the buy page would send — the fixture is written against `page.tsx:210-224` and breaks if either side drifts;
- `verticalToSector` is total over the seven verticals and lands only in the four-value `Sector` union;
- `selectedModules` is `undefined` (not `[]`) when nothing is selected, matching the buy page's contract;
- source-text — the nav source honours `NEXT_PUBLIC_USE_CONFIGURATOR`.

**Rollback:** flip the flag; the configurator route stays reachable-but-unlinked, or is deleted, with the live purchase path unaffected.

---

## PR 5.6 — Imagery asset production

**Scope:** replace the 19 placeholders with final art. Asset production, not application code — no failing-test shape (the honest limit this doc set already accepted for artwork in the summary doc), and parallel to 5.5.

**Work order:** §Imagery, verbatim — master style block + the per-asset subject paragraph, one generation per file, saved to the §File-convention path at the stated size. Same filenames, so this PR is file replacement only; PR 5.4's asset-existence spec keeps passing throughout.

**Review gate:** the §Set-consistency checklist, checked across the whole set before merge. A single image failing the five-second read test goes back for regeneration — the checklist is the design review this PR has instead of a test suite.

**Rollback:** restore the placeholder files. N/A for code.

---

## PR 5.7 — Version bump `2.4.0`

**Scope:** Phase 5 ships as `2.4.0` (Decision A). User-facing, so it takes the minor.

**Key files:** root `package.json` and `packages/util/src/version.ts` — `"2.3.0"` → `"2.4.0"`.

**Failing test first:** grep the outgoing version across `apps` + `packages` and update the pinned expectations (the `/health` assertion and both footer tests, per 04a PR 4.7's precedent).

**Release note (human/CI):** annotated tag `v2.4.0` + GitHub release. Call out: the configurator ships **dark behind `NEXT_PUBLIC_USE_CONFIGURATOR`**; flipping it in production is the rollout decision, and Phase 6 should not start until it has been live and stable. Note which modules show "Coming soon" pending their Stripe Products (Open Decision 2).

**Rollback:** revert the two constants and the test expectations.

---

## Acceptance criteria

- [ ] `MODULE_CATALOG` covers exactly the nine platform modules, with label, description, image path, and price codes each — proven against `MODULE_CAPABILITIES`, not hand-counted (PR 5.1).
- [ ] `calculateCartTotals` accepts `selectedModules` for all nine modules; the legacy `learningModule` path and all existing buy-page specs pass unchanged (PR 5.1).
- [ ] The step sequence matches dev-doc §5; back/forward preserves state; auto-resolved verticals skip cleanly; jumping past a prerequisite redirects back (PR 5.2).
- [ ] Every selectable option shows a price chip that provably equals its effect on the total, for every module and storage tier in both intervals (PR 5.3).
- [ ] A module with no mapped Stripe price renders "Coming soon" and cannot be selected — the UI never offers what the API's charge gate would reject (PR 5.3).
- [ ] The stage performs the §choreography contract: add springs in, remove fades out, vertical crossfades under persistent objects, storage swaps by stack height — and collapses gracefully under `prefers-reduced-motion` (PR 5.4).
- [ ] All 19 asset paths resolve on disk, proven by the asset-existence spec (PR 5.4, preserved through 5.6).
- [ ] A completed configurator run produces a `createCheckoutSession` body deep-equal to what the buy page sends for equivalent selections, including the derived legacy `sector` (PR 5.5).
- [ ] `/pricing` and `/buy` remain reachable and byte-identical in behaviour; the flag only redirects navigation (PR 5.5).
- [ ] The final asset set passes the §Set-consistency checklist, including the five-second read test (PR 5.6).
- [ ] Product version reads `2.4.0` in `/health` and both footers (PR 5.7).

## Open decisions

1. **Trial-wizard sharing** (carried from the summary doc). The trial TODO's steps collect org identity early; this flow defers it to summary (Decision I). Recommend building this configurator standalone, then revisiting the trial wizard against the finished 5.2 shell — extraction with two real consumers beats speculation with one.
2. **Stripe Products and Prices for the eight non-Learning modules** — the operational half, needing commercial sign-off per module (04a Open Decision 1's shape, times eight). Until mapped, each shows "Coming soon"; when mapped, it becomes purchasable with zero frontend changes (Decision E). The launch decision is therefore commercial sequencing, not engineering.
3. **Module description copy sign-off.** §Imagery's descriptions are working copy written to unblock the build; brand review before the flag flips is cheap and worth it. Same for the vertical-features bullets in PR 5.3.
4. **Nursery's position in the org-type tree** (Decision H). The dev doc lists Nursery both as a top-level type and inside School's narrowing example. This plan takes the top-level reading; if product wants nurseries reached via School, the change is confined to `verticalsForOrgType` and its test.
5. **Per-step URLs.** Decision G keeps one route. If analytics or support workflows later need step deep-links, add a `?step=` search param mirroring (not replacing) the state machine — flagged so nobody rebuilds the state model for it.
6. **Org-type step iconography.** The five org-type cards could carry imagery too (reusing the vertical dioramas where the mapping is 1:1, and a neutral composite for School). Not in the 19-asset work order; decide after the flow is clickable — it may not need it.
