# NexSteps Home Approved Prototype

**Status:** Approved interaction and visual reference

**Snapshot date:** 28 July 2026

**Production target:** `apps/nexsteps-home` (updated from the original
`apps/mobile` target — see the change-control entry in
[`docs/NexStepsV2/nexsteps-home/README.md`](../../docs/NexStepsV2/nexsteps-home/README.md#change-control))

This standalone Vite/React prototype contains the 76 approved NexSteps Home
wireframe screens across setup, Week/Today, Progress, Community, Family,
Regulations & Evidence, and moderation - plus 5 tablet two-pane composites
(Plan 03) that recompose an existing approved list screen and its detail
screen side by side for the iPad device preset. The composites reuse their
source screens' blocks verbatim; they are not new content.

It is deliberately outside `pnpm-workspace.yaml`. It must not affect Pathway
builds, dependencies or ACE vertical work.

## Run locally

Use Node.js 24 or newer:

```bash
cd prototypes/nexsteps-home
npm install
npm run test:wireframes
npm run build
npm run dev
```

Open the local URL printed by Vite. The flow index provides access to every
screen; primary buttons and approved card/list targets navigate between the
core states.

## Fidelity baselines

```bash
npm run dev            # in one terminal, leave running
npm run capture:baselines   # in another
```

Captures all 76 screens at both device presets (iPhone, Pixel 10) into
`baselines/<device>/<screen-id>.png`, committed as the reference
`apps/nexsteps-home`'s fidelity gate (`apps/nexsteps-home/fidelity/run.ts`)
diffs against. Re-run and commit the updated PNGs whenever an approved
screen's visual treatment changes. Requires Node 20.19+/22.12+ for Vite —
Playwright itself has no stricter requirement than the rest of this project.

## Boundary

This is reference code, not a production package.

- Do not import its DOM components, CSS or mock data into `apps/mobile`.
- Do not add it to the monorepo pnpm workspace.
- Implement screens with Expo Router, React Native, `mobileTokens`, existing
  mobile primitives and real authenticated APIs.
- Use `docs/NexStepsV2/nexsteps-home/screen-inventory.json` for stable screen
  IDs.
- Use `docs/NexStepsV2/nexsteps-home/implementation-map.md` for production
  route, API, data and permission boundaries.

## Useful files

- `src/wireframes-data.ts` — main screen registry.
- `src/regulations-wireframes.ts` — Regulations & Evidence registry.
- `src/wireframe-types.ts` — registry contract.
- `src/Prototype.tsx` — navigation and renderer.
- `src/prototype.css` — approved visual treatment.
- `scripts/check-wireframes.mjs` — regulations/navigation contract.
- `scripts/capture-baselines.mjs` — fidelity baseline capture (see above).
- `baselines/` — committed fidelity baseline PNGs, one per screen per device.
- `mobile-runtime.lock.json` — protected prototype runtime integrity record.

The sample family, dates, correspondence and evidence are fictional. Official
information shown in the prototype is illustrative and must pass the content
verification operation before production use.
