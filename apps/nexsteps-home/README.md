# NexSteps Home

Mobile and tablet Expo app for the NexSteps Home product. Backed by the
existing `apps/api`. Ships zero product screens today - this is Plans 01-02
(app scaffolding, fidelity harness) of the [NexSteps Home build-plan series](../../docs/NexStepsV2/nexsteps-home/build-plans/README.md).

Read the series' [PROGRESS.md](../../docs/NexStepsV2/nexsteps-home/build-plans/PROGRESS.md)
before making changes here - it is the live handoff ledger for this work.
Read [`docs/NexStepsV2/nexsteps-home/`](../../docs/NexStepsV2/nexsteps-home/README.md)
for the approved product contract, design system and 76-screen inventory
this app implements incrementally.

## Why a new app, not `apps/mobile`

Recorded under the handoff's own change-control process:
[`docs/NexStepsV2/nexsteps-home/README.md`](../../docs/NexStepsV2/nexsteps-home/README.md#change-control).

## Running

```bash
pnpm --filter @pathway/nexsteps-home dev
```

or from the repo root: `pnpm dev:nexsteps-home`.

Requires `EXPO_PUBLIC_API_URL`, `AUTH0_MOBILE_DOMAIN`, `AUTH0_MOBILE_CLIENT_ID`
(and optionally `AUTH0_MOBILE_AUDIENCE`) in the repo-root `.env` - the same
Auth0 application `apps/mobile` uses. `AUTH0_MOBILE_CUSTOM_SCHEME` defaults
to `nexstepshome` (distinct from `apps/mobile`'s `nexsteps`) so both apps
can be installed side by side without a deep-link collision.

## Structure

- `app/` - expo-router routes only, kept thin. `(setup)/` is the
  unauthenticated/onboarding stack; `(home)/(tabs)/` is the 5-tab shell
  (Week, Today, Community, Progress, Family).
- `src/design/tokens.ts` - extends `@pathway/mobile-core`'s shared tokens
  with wireframe-exact values the shared scale doesn't cover. See
  `src/design/token-conflicts.md` for every value and its source.
- `src/components/primitives/` - one component per wireframe block type
  (`notice`, `card`, `fields`, `chips`, `list`, `stats`, `message`, `week`)
  plus screen chrome (`ScreenHeader`, `ScreenActions`).
- `src/responsive/` - tablet foundation (`useFormFactor`, `TwoPane`). No
  screen consumes `TwoPane` yet - which flows get a two-pane tablet layout
  is a design decision for Plan 03, not this scaffolding plan.
- `src/screens/registry.ts` - screen ID -> route path contract for all 76
  approved screens, checked against `screen-inventory.json` by
  `registry.test.ts`.
- `src/lib/api/`, `src/lib/auth/` - ported from `apps/mobile`, adapted for
  a single "home" space (no family/serve dual-space resolution).

## Testing

```bash
pnpm --filter @pathway/nexsteps-home test:unit
```

## Fidelity gate

`fidelity/run.ts` (`pnpm --filter @pathway/nexsteps-home test:fidelity`)
exports the web build, serves it locally, and pixel-diffs each screen in
`fidelity/checklist.json` against the matching baseline captured from
`prototypes/nexsteps-home` (`npm run capture:baselines` there). Only screens
listed in `checklist.json` are asserted — it starts empty because Plan 01's
screens are placeholders, not wireframe-matched implementations; each later
plan adds its screen IDs once the real layout lands. Not yet wired into
`.github/workflows/ci.yml` — deliberately deferred to whichever plan adds the
first entry, since there is nothing to gate yet.
