# NexSteps Home Approved Prototype

**Status:** Approved interaction and visual reference

**Snapshot date:** 28 July 2026

**Production target:** `apps/mobile`

This standalone Vite/React prototype contains the 76 approved NexSteps Home
wireframe screens across setup, Week/Today, Progress, Community, Family,
Regulations & Evidence, and moderation.

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
- `mobile-runtime.lock.json` — protected prototype runtime integrity record.

The sample family, dates, correspondence and evidence are fictional. Official
information shown in the prototype is illustrative and must pass the content
verification operation before production use.
