# NexSteps Home Regulations Wireframes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing NexSteps Home mobile prototype with the approved
17-screen Regulations & Evidence flow and a fully clickable path from Family
through verified guidance, evidence, correspondence and secure sharing.

**Architecture:** Keep the protected mobile runtime unchanged. Move shared
wireframe types into a focused module, place the new feature's screen data in
its own module, and compose it into the existing screen registry. Extend the
existing generic card/list renderer with typed internal navigation targets so
the Family entry and feature paths work without introducing a router or a
parallel visual system.

**Tech Stack:** React 19, strict TypeScript, Vite 8, Radix Icons, existing
NexSteps Home CSS and protected Product Design mobile runtime.

## Global Constraints

- Preserve `src/App.tsx`, `src/main.tsx`, `src/styles.css`, `src/mobile/`,
  device assets, Vite runtime configuration and runtime lock hashes.
- Use the existing white, mint `#76D7C4`, yellow `#FFD166` and charcoal
  `#333333` visual system.
- Keep Nunito headings and Quicksand body typography.
- Maintain one mint primary action per screen and 44x44pt minimum touch targets.
- Use `Prepared`, `In progress`, `Needs review` and `Not reviewed`; never use a
  legal compliance score.
- Include England, Wales, Scotland and Northern Ireland as distinct choices.
- Every guidance example shows jurisdiction, official source and verification
  date.
- Keep Community content separate from verified regulatory content.
- Use existing Evidence references conceptually; do not imply duplicate files.
- No document is shared automatically; pack preview precedes export or secure
  sharing.
- Display the approved information-not-legal-advice wording.
- Do not use Playwright CLI or MCP; verify in the existing in-app browser.
- The local prototype directory is not a Git repository, so each task ends with
  an explicit test and diff review rather than a commit.

---

## File structure

- Create `nexsteps-home-wireframes/src/wireframe-types.ts`
  - Owns shared tab, tone, flow-group, block and screen types.
- Create `nexsteps-home-wireframes/src/regulations-wireframes.ts`
  - Owns only Regulations & Evidence screen data and local data builders.
- Create `nexsteps-home-wireframes/scripts/check-wireframes.mjs`
  - Performs dependency-free registry, target and copy-safety checks.
- Modify `nexsteps-home-wireframes/src/wireframes-data.ts`
  - Imports shared types, adds the regulations group, composes the new screens
    and adds the Family entry target.
- Modify `nexsteps-home-wireframes/src/Prototype.tsx`
  - Makes typed card/list destinations navigate through the existing
    `navigate()` function and adds explicit secondary destinations.
- Modify `nexsteps-home-wireframes/src/prototype.css`
  - Adds selected/document/source/share states using existing tokens.
- Modify `nexsteps-home-wireframes/package.json`
  - Adds `test:wireframes`.
- Modify `nexsteps-home-wireframes/AGENTS.md`
  - Records the approved UK-first, global-ready product decision.

---

### Task 1: Add a failing wireframe contract check

**Files:**

- Create: `nexsteps-home-wireframes/scripts/check-wireframes.mjs`
- Modify: `nexsteps-home-wireframes/package.json`

**Interfaces:**

- Consumes: TypeScript source files as UTF-8 text.
- Produces: `npm run test:wireframes`, exiting non-zero when the regulations
  registry is absent, incomplete, contains broken internal targets, or uses
  prohibited compliance claims.

- [ ] **Step 1: Write the failing contract check**

Create `scripts/check-wireframes.mjs` with these exact expected screen IDs:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const dataSource = await readFile(
  new URL("src/wireframes-data.ts", root),
  "utf8",
);
const regulationsSource = await readFile(
  new URL("src/regulations-wireframes.ts", root),
  "utf8",
);

const expectedRegulationsIds = [
  "regulations-jurisdiction",
  "regulations-overview",
  "regulations-requirements",
  "regulations-requirement-detail",
  "regulations-evidence",
  "regulations-evidence-upload",
  "regulations-updates",
  "regulations-update-detail",
  "regulations-correspondence",
  "regulations-correspondence-detail",
  "regulations-correspondence-add",
  "regulations-pack-scope",
  "regulations-pack-evidence",
  "regulations-pack-preview",
  "regulations-pack-share",
  "regulations-share-confirmation",
  "regulations-share-activity",
];

const combined = `${dataSource}\n${regulationsSource}`;
const ids = [
  ...combined.matchAll(/\bid:\s*"([^"]+)"[\s\S]{0,100}?\bgroup:\s*"[^"]+"/g),
].map(([, id]) => id);
const targets = [
  ...combined.matchAll(/\b(?:primaryTarget|target):\s*"([^"]+)"/g),
].map(([, target]) => target);

assert.equal(new Set(ids).size, ids.length, "screen IDs must be unique");
for (const id of expectedRegulationsIds) {
  assert.ok(ids.includes(id), `missing regulations screen: ${id}`);
}
for (const target of targets) {
  assert.ok(ids.includes(target), `broken internal target: ${target}`);
}

assert.match(dataSource, /id:\s*"regulations-evidence"/);
assert.match(regulationsSource, /group:\s*"regulations-evidence"/);
assert.match(dataSource, /target:\s*"regulations-overview"/);
assert.match(regulationsSource, /England/);
assert.match(regulationsSource, /Wales/);
assert.match(regulationsSource, /Scotland/);
assert.match(regulationsSource, /Northern Ireland/);
assert.match(regulationsSource, /does not provide legal advice/i);
assert.doesNotMatch(
  regulationsSource,
  /\b(?:legally compliant|guaranteed protection|proves compliance)\b/i,
);

console.log(
  `Validated ${expectedRegulationsIds.length} Regulations & Evidence screens.`,
);
```

Add this script to `package.json`:

```json
"test:wireframes": "node scripts/check-wireframes.mjs"
```

- [ ] **Step 2: Run the check and verify it fails**

Run:

```bash
npm run test:wireframes
```

Expected: FAIL with `ENOENT` for `src/regulations-wireframes.ts`.

- [ ] **Step 3: Review the test boundary**

Confirm the check reads only app-owned source, does not touch protected runtime
files and asserts all 17 approved screens.

---

### Task 2: Extract shared types and define the regulations screen registry

**Files:**

- Create: `nexsteps-home-wireframes/src/wireframe-types.ts`
- Create: `nexsteps-home-wireframes/src/regulations-wireframes.ts`
- Modify: `nexsteps-home-wireframes/src/wireframes-data.ts`
- Modify: `nexsteps-home-wireframes/AGENTS.md`

**Interfaces:**

- Consumes: the current `AppTab`, `Tone`, `WireframeBlock`,
  `WireframeScreen` and `FlowGroupId` contracts.
- Produces:
  - `WireframeBlock` card `target?: string`
  - `WireframeBlock` list item `target?: string`
  - `FlowGroupId` value `"regulations-evidence"`
  - `regulationsScreens: WireframeScreen[]`
  - a composed `wireframeScreens` registry with 76 unique screens.

- [ ] **Step 1: Move shared types into a focused module**

Create `src/wireframe-types.ts`:

```ts
export type AppTab = "Week" | "Today" | "Community" | "Progress" | "Family";

export type Tone = "mint" | "yellow" | "blue" | "neutral" | "danger";

export type FlowGroupId =
  | "setup"
  | "week-today"
  | "progress"
  | "community-families"
  | "community-conversations"
  | "community-meetups"
  | "family-settings"
  | "regulations-evidence"
  | "moderation";

export type WireframeBlock =
  | {
      type: "notice";
      title: string;
      body: string;
      tone?: Tone;
    }
  | {
      type: "card";
      title: string;
      body: string;
      meta?: string;
      action?: string;
      target?: string;
      tone?: Tone;
    }
  | {
      type: "fields";
      fields: Array<{ label: string; value: string; helper?: string }>;
    }
  | {
      type: "chips";
      label?: string;
      items: string[];
      active?: string[];
    }
  | {
      type: "list";
      title?: string;
      items: Array<{
        title: string;
        detail?: string;
        meta?: string;
        target?: string;
      }>;
    }
  | {
      type: "stats";
      items: Array<{ value: string; label: string }>;
    }
  | {
      type: "message";
      sender: string;
      body: string;
      time: string;
      own?: boolean;
    }
  | {
      type: "week";
      activeDay: string;
      days: Array<{ day: string; date: string; count?: number }>;
    };

export interface WireframeScreen {
  id: string;
  group: FlowGroupId;
  eyebrow: string;
  title: string;
  description: string;
  tab?: AppTab;
  blocks: WireframeBlock[];
  primaryAction?: string;
  primaryTarget?: string;
  secondaryAction?: string;
}
```

In `wireframes-data.ts`, import these types and re-export them so the existing
`Prototype.tsx` import remains valid:

```ts
import { regulationsScreens } from "./regulations-wireframes";
import type {
  AppTab,
  FlowGroupId,
  Tone,
  WireframeBlock,
  WireframeScreen,
} from "./wireframe-types";

export type {
  AppTab,
  FlowGroupId,
  Tone,
  WireframeBlock,
  WireframeScreen,
} from "./wireframe-types";
```

- [ ] **Step 2: Add the flow-group definition**

Insert after `family-settings`:

```ts
{
  id: "regulations-evidence",
  label: "Family · regulations & evidence",
  summary:
    "Verified guidance, prepared evidence, correspondence and controlled sharing.",
},
```

- [ ] **Step 3: Define focused screen-data builders**

In `src/regulations-wireframes.ts`, import the shared types and define typed
local builders:

```ts
import type { Tone, WireframeBlock, WireframeScreen } from "./wireframe-types";

const notice = (
  title: string,
  body: string,
  tone: Tone = "mint",
): WireframeBlock => ({ type: "notice", title, body, tone });

const card = (
  title: string,
  body: string,
  options: {
    meta?: string;
    action?: string;
    target?: string;
    tone?: Tone;
  } = {},
): WireframeBlock => ({ type: "card", title, body, ...options });

const list = (
  items: Array<{
    title: string;
    detail?: string;
    meta?: string;
    target?: string;
  }>,
  title?: string,
): WireframeBlock => ({ type: "list", title, items });
```

Also define local `fields`, `chips` and `stats` builders matching the shared
block contract.

- [ ] **Step 4: Add the exact screen registry**

Create `regulationsScreens` using this screen and destination map:

| ID                                  | Title                              | Primary destination                 |
| ----------------------------------- | ---------------------------------- | ----------------------------------- |
| `regulations-jurisdiction`          | Show guidance for your family      | `regulations-overview`              |
| `regulations-overview`              | Stay prepared                      | `regulations-update-detail`         |
| `regulations-requirements`          | Your requirements                  | `regulations-requirement-detail`    |
| `regulations-requirement-detail`    | Show how learning remains suitable | `regulations-evidence`              |
| `regulations-evidence`              | Evidence vault                     | `regulations-evidence-upload`       |
| `regulations-evidence-upload`       | Add supporting evidence            | `regulations-correspondence`        |
| `regulations-updates`               | Official updates                   | `regulations-update-detail`         |
| `regulations-update-detail`         | What changed in England            | `regulations-requirement-detail`    |
| `regulations-correspondence`        | Correspondence                     | `regulations-correspondence-add`    |
| `regulations-correspondence-detail` | Annual enquiry                     | `regulations-pack-scope`            |
| `regulations-correspondence-add`    | Add correspondence                 | `regulations-correspondence-detail` |
| `regulations-pack-scope`            | Prepare an evidence pack           | `regulations-pack-evidence`         |
| `regulations-pack-evidence`         | Choose supporting evidence         | `regulations-pack-preview`          |
| `regulations-pack-preview`          | Review exactly what is shared      | `regulations-pack-share`            |
| `regulations-pack-share`            | Export or share securely           | `regulations-share-confirmation`    |
| `regulations-share-confirmation`    | Secure link created                | `regulations-share-activity`        |
| `regulations-share-activity`        | Access activity                    | `regulations-overview`              |

Every screen has `tab: "Family"` and
`group: "regulations-evidence"`. Use the approved specification for the full
visible copy, with realistic sample data:

- Brown family;
- Maya, age 9;
- England;
- Leeds City Council;
- a verified DfE update dated 19 August 2024 and checked 28 July 2026;
- a parent-entered response deadline of 14 September;
- an annual education summary, science project and reading log;
- a seven-day expiring link with no public access.

Include this exact notice on Overview and Pack Preview:

```ts
notice(
  "Information, not legal advice",
  "NexSteps helps you organise official information and your family's evidence. It does not provide legal advice or guarantee compliance.",
  "neutral",
);
```

- [ ] **Step 5: Compose the new registry and Family entry**

Spread `regulationsScreens` after the existing Family screens and before
moderation screens:

```ts
export const wireframeScreens: WireframeScreen[] = [
  ...householdAndCommunityScreens,
  ...regulationsScreens,
  ...moderationScreens,
];
```

Preserve the current literal array structure by placing
`...regulationsScreens` immediately before the first moderation object; do not
rewrite unrelated screen data.

Add this targetable card at the start of the existing `family-children`
blocks:

```ts
{
  type: "card",
  title: "Regulations & Evidence",
  body: "Stay prepared and keep important records together.",
  meta: "2 to review",
  action: "Open",
  target: "regulations-overview",
  tone: "yellow",
},
```

Update the existing `card` and `list` helpers in `wireframes-data.ts` to accept
typed targets without altering current call sites.

- [ ] **Step 6: Record the durable product decision**

Append this short section to `nexsteps-home-wireframes/AGENTS.md`:

```md
## NexSteps Home product decisions

- Regulations & Evidence uses a global jurisdiction model and launches with
  distinct content for England, Wales, Scotland and Northern Ireland.
- The feature reports parent-controlled preparedness, never legal compliance.
- Official requirements and updates remain source-attributed and separate from
  Community content.
```

- [ ] **Step 7: Run the contract check**

Run:

```bash
npm run test:wireframes
```

Expected:

```text
Validated 17 Regulations & Evidence screens.
```

---

### Task 3: Make feature cards and rows navigate

**Files:**

- Modify: `nexsteps-home-wireframes/src/Prototype.tsx`
- Modify: `nexsteps-home-wireframes/src/wireframes-data.ts`

**Interfaces:**

- Consumes: `WireframeBlock` targets and the existing
  `(id: string) => void` `navigate` function.
- Produces: clickable target-bearing cards and list rows, while non-target blocks
  remain visually unchanged.

- [ ] **Step 1: Pass navigation into block rendering**

Change:

```tsx
<Block key={`${activeScreen.id}-${index}`} block={block} />
```

to:

```tsx
<Block
  key={`${activeScreen.id}-${index}`}
  block={block}
  onNavigate={navigate}
/>
```

Change the signature to:

```ts
function Block({
  block,
  onNavigate,
}: {
  block: WireframeBlock;
  onNavigate: (id: string) => void;
}) {
```

- [ ] **Step 2: Make target-bearing cards actionable**

For card blocks, keep the existing article and action styling. Add
`onClick={() => block.target && onNavigate(block.target)}` to the inline action,
and disable it when there is no target only if it is meant to be an internal
navigation action:

```tsx
{
  block.action ? (
    <button
      type="button"
      className="inline-action"
      onClick={() => block.target && onNavigate(block.target)}
    >
      {block.action} <ChevronRightIcon />
    </button>
  ) : null;
}
```

Existing visual-only actions remain harmless when they have no target.

- [ ] **Step 3: Make target-bearing list rows actionable**

Update each list row:

```tsx
<button
  type="button"
  className="list-row"
  onClick={() => item.target && onNavigate(item.target)}
  key={item.title}
>
```

Use target-bearing rows for:

- Requirement list → requirement detail
- Updates feed → update detail
- Correspondence list → correspondence detail
- Evidence vault → evidence upload
- Share confirmation → access activity

- [ ] **Step 4: Add secondary destinations**

Extend `secondaryTargets`:

```ts
"regulations-overview": "regulations-jurisdiction",
"regulations-requirement-detail": "regulations-requirements",
"regulations-evidence-upload": "regulations-evidence",
"regulations-update-detail": "regulations-updates",
"regulations-correspondence-detail": "regulations-correspondence",
"regulations-correspondence-add": "regulations-correspondence",
"regulations-pack-scope": "regulations-correspondence-detail",
"regulations-pack-evidence": "regulations-pack-scope",
"regulations-pack-preview": "regulations-pack-evidence",
"regulations-pack-share": "regulations-pack-preview",
"regulations-share-confirmation": "regulations-pack-share",
"regulations-share-activity": "regulations-overview",
```

- [ ] **Step 5: Verify target integrity and type safety**

Run:

```bash
npm run test:wireframes
npx tsc --noEmit
```

Expected: both commands PASS.

---

### Task 4: Add feature-specific visual states

**Files:**

- Modify: `nexsteps-home-wireframes/src/prototype.css`
- Modify: `nexsteps-home-wireframes/src/regulations-wireframes.ts`

**Interfaces:**

- Consumes: existing notice, content-card, list, chip, stats, field and action
  components.
- Produces: a premium but restrained preparedness hierarchy without a new
  component system.

- [ ] **Step 1: Reuse existing primitives first**

Build all 17 screens from the existing block types. Use:

- yellow notice for the single current-focus change or deadline;
- mint notice for prepared/success states;
- blue notice for official-source provenance;
- neutral notice for the legal-information disclaimer;
- danger only for a failed scan or revoked share example.

Do not add nested cards or custom illustration markup.

- [ ] **Step 2: Add only the missing state styles**

Add these CSS classes to `prototype.css`:

```css
.source-freshness {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--ink-muted);
  font-size: 0.76rem;
  font-weight: 700;
}

.document-state {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--mint-soft);
  color: var(--ink);
  font-size: 0.75rem;
  font-weight: 800;
}

.share-audit-row {
  display: grid;
  grid-template-columns: 10px 1fr auto;
  gap: 10px;
  align-items: start;
}
```

If the data-driven blocks do not require one of these selectors, remove that
selector rather than adding unused CSS.

- [ ] **Step 3: Check compact mobile layout**

Review all 17 screens at both protected device presets:

- iPhone
- Pixel 10

Confirm:

- headings do not clip;
- no card is nested inside another card;
- the fixed bottom navigation does not cover the final action;
- official-source labels wrap cleanly;
- long dates and `Northern Ireland` remain readable;
- action buttons meet the 44pt target.

- [ ] **Step 4: Run build and runtime checks**

Run:

```bash
npm run test:wireframes
npm run check:runtime
npm run build
```

Expected: all three commands PASS and the runtime lock remains unchanged.

---

### Task 5: Verify the complete clickable parent journey

**Files:**

- Inspect: `nexsteps-home-wireframes/src/Prototype.tsx`
- Inspect: `nexsteps-home-wireframes/src/regulations-wireframes.ts`
- Inspect: `nexsteps-home-wireframes/src/prototype.css`

**Interfaces:**

- Consumes: the built feature and the existing in-app browser at
  `http://127.0.0.1:5173/`.
- Produces: a verified 76-screen prototype with a working Regulations &
  Evidence main path.

- [ ] **Step 1: Open the existing prototype in the in-app browser**

Keep the current local server and protected device frame. Do not use Playwright
CLI or a second browser.

- [ ] **Step 2: Verify the primary path**

Click through:

```text
Family
→ Regulations & Evidence
→ Review what changed
→ Review affected requirement
→ Link evidence
→ Add supporting evidence
→ Correspondence
→ Add correspondence
→ Prepare evidence pack
→ Choose supporting evidence
→ Review exact pack
→ Export or share securely
→ Secure link created
→ Access activity
```

Confirm each primary button and target-bearing row reaches the expected screen.

- [ ] **Step 3: Verify secondary paths**

Check:

- Overview → Change location
- All UK nation choices are visible
- Requirements list → requirement detail
- Updates feed → update detail
- Correspondence list → correspondence detail
- Pack Preview → Back to evidence selection
- Secure Share → Back to preview
- Access Activity → Revoke or return to overview

- [ ] **Step 4: Perform visual QA**

Inspect visible spacing, text hierarchy, wrapping, radii, shadows, button states,
bottom-navigation clearance and dynamic content density. Fix every visible
issue in app-owned files, then repeat the same path.

- [ ] **Step 5: Run final verification**

Run:

```bash
npm run test:wireframes
npm run check:runtime
npm run build
```

Expected:

- 17 Regulations & Evidence screens validated;
- protected runtime integrity passed;
- strict TypeScript and Vite production build passed;
- `dist/client/index.html`, `dist/server/index.js`,
  `dist/.openai/hosting.json` and `.openai/hosting.json` exist.

- [ ] **Step 6: Review changed files**

Confirm:

- no protected runtime file changed;
- no unused imports or selectors remain;
- no broken target exists;
- no legal-compliance claim appears;
- no child evidence is presented as Community-visible;
- all new files have one clear responsibility.
