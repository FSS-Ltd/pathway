# NexSteps Home Implementation Handoff

| Field              | Value                                                          |
| ------------------ | -------------------------------------------------------------- |
| Owner              | Product / Engineering                                          |
| Status             | Approved product and UX reference                              |
| Approved           | 28 July 2026                                                   |
| Production target  | `apps/mobile` with supporting API, worker and database modules |
| Approved prototype | `prototypes/nexsteps-home`                                     |
| Screen inventory   | 76 screens across 9 flow groups                                |

This folder is the mandatory starting point for work on NexSteps Home. It
connects the approved product experience to the existing Pathway architecture
without treating the reference prototype as production code.

## Start here

An agent or developer implementing NexSteps Home must:

1. Read the repository `AGENTS.md` and complete its Graphify pre-change gate.
2. Read this file and [product-contract.md](product-contract.md).
3. Read [implementation-map.md](implementation-map.md) for the production
   boundaries and low-conflict PR sequence.
4. Read the owning phase plan:
   [Phase 7 — NexSteps Home](../07-nexsteps-home.md) or
   [Phase 8 — Community](../08-community.md).
5. Use [screen-inventory.json](screen-inventory.json) to name the approved
   screens covered by the change.
6. Inspect the relevant flow in the
   [approved prototype](../../../prototypes/nexsteps-home/README.md) and its
   representative screenshots.
7. Implement the behaviour with the real Expo, API, database, storage,
   entitlement and audit patterns.
8. Validate the change against
   [acceptance-criteria.md](acceptance-criteria.md).

Run the handoff contract check from the repository root:

```bash
node docs/NexStepsV2/nexsteps-home/validate-handoff.mjs
```

## Source precedence

If sources disagree, use this order:

1. Security, privacy, safeguarding and legal obligations.
2. Current production architecture and merged ADRs.
3. This approved product contract and screen inventory.
4. Phase 7 and Phase 8 implementation plans.
5. The runnable prototype and approved screenshots.
6. Older static Family Space mock-ups.

The prototype supersedes the old hardcoded Family Space mock-up as the approved
NexSteps Home experience. It does not override secure production architecture.

## What is authoritative

- The product outcome, information architecture, terminology and navigation.
- The nine flow groups and 76 approved screen IDs.
- The primary actions and navigation relationships in the screen inventory.
- The community consent, child-data exclusion and moderation boundaries.
- The UK-first Regulations & Evidence preparedness model.
- The NexSteps visual language and mobile accessibility requirements.
- The implementation boundary: Pathway remains one platform and NexSteps Home
  is implemented in the existing production apps and packages.

## What is illustrative

- Names, dates, family details, correspondence and evidence shown in the
  prototype are fictional sample content.
- Prototype field controls do not define the final API DTOs or database schema.
- Candidate production routes in the implementation map must be reconciled
  with the current Expo Router tree at the start of each PR.
- Official-information examples are not a substitute for the content review
  and source-verification operation described in
  [regulations-and-evidence.md](regulations-and-evidence.md).

## Handoff contents

| Artifact                                                   | Purpose                                               |
| ---------------------------------------------------------- | ----------------------------------------------------- |
| [product-contract.md](product-contract.md)                 | Approved outcomes, boundaries and product decisions   |
| [implementation-map.md](implementation-map.md)             | Flow-to-route, API, data, permission and PR mapping   |
| [design-system.md](design-system.md)                       | Production token and component usage                  |
| [acceptance-criteria.md](acceptance-criteria.md)           | Definition of done for every implementation PR        |
| [community-user-flows.md](community-user-flows.md)         | Detailed end-to-end family and Community behaviour    |
| [regulations-and-evidence.md](regulations-and-evidence.md) | Detailed UK-first preparedness and evidence behaviour |
| [screen-inventory.json](screen-inventory.json)             | Machine-readable screen and navigation contract       |
| [approved-screens](approved-screens)                       | Representative iPhone and Pixel visual references     |
| [prototype](../../../prototypes/nexsteps-home/README.md)   | Runnable approved interaction reference               |

## Production boundary

The prototype is a standalone Vite/React application for review. Do not import
its DOM components, CSS, device runtime or mock data into production.

Production NexSteps Home work belongs in:

- `apps/mobile` for Expo routes and React Native screens;
- `apps/api` for authenticated household and Community APIs;
- `apps/workers` for report, notification, file and content jobs;
- `packages/db` for reviewed schema changes and migrations;
- `packages/platform` for additive capabilities and entitlement resolution;
- `packages/mobile-core` and `packages/ui` for genuinely shared primitives.

Use the existing production tokens and components first. Extend them only when
the approved state cannot be expressed accessibly with an existing primitive.

## ACE coexistence

ACE and NexSteps Home share the platform engine but are separate vertical
surfaces. To keep work mergeable:

- add new capabilities instead of renaming or repurposing ACE capabilities;
- never add Home behaviour to an ACE grant map;
- keep Home routes and content in Home/family namespaces;
- land schema changes separately from consumers;
- build Community through a narrow, explicit cross-household policy path;
- rebase each small PR onto current `master`;
- resolve shared-platform needs through focused interface changes with tests;
- do not bundle ACE refactors into a Home PR.

This handoff PR intentionally changes no production app, package, migration,
capability or ACE file.

## Change control

When implementation reveals a necessary change to an approved flow:

1. Record the reason and affected screen IDs in the PR.
2. Update the product contract and inventory in the same PR, or link an
   approved follow-up decision.
3. Preserve security and safeguarding rules even when the visual flow changes.
4. Regenerate affected screenshots only after product review.
5. Re-run the handoff validator and Graphify update.

### Log

- **2026-08-01 — Production target moved from `apps/mobile` to a new
  `apps/nexsteps-home`.** Reason: a clean 5-tab shell with no legacy Family
  Space migration constraint and no inherited portrait lock. Cost accepted:
  duplicated auth/API-client/build wiring versus `apps/mobile` until a
  shared-package extraction is warranted. No screen IDs affected — this is
  an architecture decision, not a screen change. No security or
  safeguarding rule changes. Full build-plan series, decision rationale and
  live progress tracking: [`build-plans/`](build-plans/README.md).
