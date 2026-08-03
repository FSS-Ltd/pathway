# NexSteps Home Waitlist Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a cinematic, search-optimised NexSteps Home landing page at `/homeschool` that uses approved product screens, captures privacy-conscious waitlist submissions, and is linked from the marketing navigation.

**Architecture:** A server-rendered Next.js route owns discoverable content, metadata, and JSON-LD. Small client components own scroll-linked Framer Motion reveals and the waitlist form. A dedicated NestJS lead endpoint validates the approved fields and stores them in the existing lead table as a homeschool-tagged trial lead.

**Tech Stack:** Next.js 14 App Router, React 18, strict TypeScript, Tailwind CSS, Framer Motion 11, NestJS 10, Zod, Prisma, Jest.

## Global Constraints

- Do not collect child names, ages, dates of birth, photos, or learning records.
- Do not claim NexSteps provides legal advice or guarantees compliance.
- Use only existing dependencies.
- Preserve the approved NexSteps Home visual tokens: mint `#76D7C4`, yellow `#FFD166`, charcoal `#333333`, white surfaces, Nunito headings, and calm rounded surfaces.
- Keep the route server-rendered; isolate only motion and form interaction in client components.
- Honour reduced-motion preferences and WCAG 2.2 AA.
- Store waitlist submissions without a database migration.

---

### Task 1: Add the homeschool lead API contract

**Files:**
- Modify: `apps/api/src/leads/dto/create-lead.dto.ts`
- Modify: `apps/api/src/leads/leads.controller.ts`
- Modify: `apps/api/src/leads/leads.service.ts`
- Modify: `apps/api/src/leads/tests/leads.service.spec.ts`

**Interfaces:**
- Consumes: existing `LeadKind.TRIAL`, `Prisma.InputJsonObject`, and UTM schema.
- Produces: `createHomeschoolLeadDto`, `CreateHomeschoolLeadDto`, `LeadsService.createHomeschoolLead(dto)`, and `POST /leads/homeschool`.

- [ ] **Step 1: Write DTO and service tests that fail**

Add assertions that valid approved values parse, false consent and unknown region fail, and the service writes `sector: "homeschool"` with campaign, region, stage, and consent timestamp in `metadataJson`. Add a duplicate-path assertion that the lookup includes `sector: "homeschool"`.

```ts
const parsed = createHomeschoolLeadDto.safeParse({
  firstName: "Sam",
  email: "sam@example.com",
  region: "england",
  stage: "home-educating",
  consentMarketing: true,
});
expect(parsed.success).toBe(true);
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `pnpm --filter @pathway/api test:unit -- --runTestsByPath src/leads/tests/leads.service.spec.ts --runInBand`  
Expected: FAIL because `createHomeschoolLeadDto` and `createHomeschoolLead` do not exist.

- [ ] **Step 3: Add the strict DTO**

Define literal arrays for regions and stages, require a trimmed first name between 1 and 100 characters, validate email, require `consentMarketing: true`, and reuse the current UTM schema.

```ts
export const createHomeschoolLeadDto = z.object({
  firstName: z.string().trim().min(1).max(100),
  email: z.string().email("Invalid email address"),
  region: z.enum(homeschoolRegions),
  stage: z.enum(homeschoolStages),
  consentMarketing: z.literal(true),
  utm: utmSchema,
});
```

- [ ] **Step 4: Add sector-scoped persistence and controller route**

Use a focused recent-lead lookup with `email`, `LeadKind.TRIAL`, and `sector: "homeschool"`. Store:

```ts
const metadataJson: Prisma.InputJsonObject = {
  campaign: "nexsteps-home-waitlist",
  homeschoolRegion: dto.region,
  homeschoolStage: dto.stage,
  homeschoolMarketingConsentAt: new Date().toISOString(),
};
```

The controller returns `{ success: true, id: lead.id }` after safe parsing.

- [ ] **Step 5: Run the focused API test**

Run: `pnpm --filter @pathway/api test:unit -- --runTestsByPath src/leads/tests/leads.service.spec.ts --runInBand`  
Expected: PASS.

### Task 2: Add the typed web client and content contract

**Files:**
- Modify: `apps/web/lib/leads-client.ts`
- Create: `apps/web/components/homeschool/homeschool-content.ts`
- Create: `apps/web/__tests__/homeschool-landing.spec.ts`

**Interfaces:**
- Consumes: existing API URL and attribution UTM shape.
- Produces: `CreateHomeschoolLeadPayload`, `createHomeschoolLead(payload)`, `homeschoolProductChapters`, `homeschoolFaqs`, `HomeschoolRegion`, and `HomeschoolStage`.

- [ ] **Step 1: Write the web contract test and verify failure**

Read the source files and assert the dedicated endpoint, approved fields, five screenshot names, required JSON-LD types, canonical route, and Homeschool nav entry.

Run: `pnpm --filter @pathway/web test:unit -- --runTestsByPath __tests__/homeschool-landing.spec.ts --runInBand`  
Expected: FAIL because the route and client do not exist.

- [ ] **Step 2: Add the typed lead client**

```ts
export async function createHomeschoolLead(
  payload: CreateHomeschoolLeadPayload,
): Promise<{ success: boolean; id: string }> {
  const response = await fetch(`${API_BASE_URL}/leads/homeschool`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Unable to join the NexSteps Home waitlist");
  return (await response.json()) as { success: boolean; id: string };
}
```

- [ ] **Step 3: Add the typed content module**

Define the five chapter records with stable IDs, eyebrow, question-style heading, immediate answer, screen source, alt text, and accent. Define four useful FAQs whose exact questions and answers are reused by both the visible accordion and FAQ JSON-LD.

- [ ] **Step 4: Re-run the focused web test**

Expected: still FAIL only for the route, navigation, sitemap, form, and assets not yet implemented.

### Task 3: Build accessible product reveal and waitlist components

**Files:**
- Create: `apps/web/components/homeschool/product-reveal.tsx`
- Create: `apps/web/components/homeschool/waitlist-form.tsx`

**Interfaces:**
- Consumes: `HomeschoolProductChapter`, `HomeschoolRegion`, `HomeschoolStage`, `createHomeschoolLead`, and `getFirstTouchAttribution`.
- Produces: `ProductReveal` and `WaitlistForm` React components.

- [ ] **Step 1: Implement scroll-linked reveal with reduced-motion fallback**

Use `useScroll`, `useTransform`, and `useReducedMotion`. Each desktop chapter uses a sticky 140vh region with a transform range from distant and rotated to crisp and front-facing. Mobile uses a shorter static stack. All visible content stays in the DOM regardless of animation.

- [ ] **Step 2: Implement the waitlist form**

Render labelled controls for first name, email, region, stage, and consent. Preserve values on failure, disable only during submission, use `aria-live="polite"`, and replace the form with a concise success state on success. Submit UTM attribution with the typed payload.

- [ ] **Step 3: Inspect both files for focus, labels, and reduced motion**

Verify there is one label per control, no child-data field, a privacy link, visible focus styles, and no scroll animation when `useReducedMotion()` is true.

### Task 4: Build the server-rendered landing route and search contract

**Files:**
- Create: `apps/web/app/(marketing)/homeschool/page.tsx`
- Create: `apps/web/components/homeschool/homeschool-landing-page.tsx`
- Copy: `prototypes/nexsteps-home/baselines/iphone/{week-home,today,progress-overview,community-home,regulations-overview}.png`
- Create assets under: `apps/web/public/images/homeschool/`

**Interfaces:**
- Consumes: content module, reveal component, form component, and copied images.
- Produces: indexable `/homeschool` page with metadata and JSON-LD.

- [ ] **Step 1: Copy and optimise the five approved images**

Copy only the selected images into the web public directory with stable descriptive names. Preserve source dimensions and use Next Image responsive sizing so production serves efficient variants.

- [ ] **Step 2: Implement route metadata and JSON-LD**

Export an absolute title, description, canonical, robots, Open Graph, and Twitter fields. Render JSON-LD for `WebPage`, `SoftwareApplication`, and `FAQPage`, using the same FAQ array rendered below.

- [ ] **Step 3: Implement the page composition**

Create the cinematic hero, direct-answer block, five reveals, trust principles, visible FAQ, waitlist section, and final reassurance. Keep a single H1 and semantic section headings.

- [ ] **Step 4: Verify server discoverability**

Inspect the route source and later built HTML to confirm the core copy, FAQ, images, and JSON-LD are present without waiting for client-side effects.

### Task 5: Add navigation, footer, and sitemap discovery

**Files:**
- Modify: `apps/web/components/header-nav.tsx`
- Modify: `apps/web/components/footer.tsx`
- Modify: `apps/web/app/sitemap.ts`

**Interfaces:**
- Consumes: `/homeschool` route.
- Produces: desktop/mobile primary navigation, footer discovery, and crawler discovery.

- [ ] **Step 1: Add `Homeschool` as a direct primary nav link**

Place it beside the audience-oriented links and ensure the same data array powers desktop and mobile menus.

- [ ] **Step 2: Add footer and sitemap entries**

Add `Homeschool` under “Who It’s For” and a sitemap item with monthly frequency and priority `0.9`.

- [ ] **Step 3: Run the web contract test**

Run: `pnpm --filter @pathway/web test:unit -- --runTestsByPath __tests__/homeschool-landing.spec.ts --runInBand`  
Expected: PASS.

### Task 6: Verify code and production builds

**Files:**
- Inspect every modified and created file.

**Interfaces:**
- Consumes: completed API and web implementation.
- Produces: evidence that the implementation is type-safe, lint-clean, tested, and buildable.

- [ ] **Step 1: Run focused tests**

```bash
pnpm --filter @pathway/api test:unit -- --runTestsByPath src/leads/tests/leads.service.spec.ts --runInBand
pnpm --filter @pathway/web test:unit -- --runTestsByPath __tests__/homeschool-landing.spec.ts --runInBand
```

- [ ] **Step 2: Run type and lint checks**

```bash
pnpm --filter @pathway/api typecheck
pnpm --filter @pathway/api lint
pnpm --filter @pathway/web typecheck
pnpm --filter @pathway/web lint
```

- [ ] **Step 3: Run affected builds**

```bash
pnpm --filter @pathway/api build
pnpm --filter @pathway/web build
```

- [ ] **Step 4: Review the diff and remove temporary or unrelated edits**

Inspect imports, exports, formatting, copy, metadata, accessibility, asset sizes, error states, and changed-file scope. Preserve all pre-existing user changes.

### Task 7: Verify the rendered experience in a browser

**Files:**
- No source changes unless verification finds defects.

**Interfaces:**
- Consumes: production-ready web route and API client behaviour.
- Produces: desktop/mobile visual and behavioural verification evidence.

- [ ] **Step 1: Start the web application and open `/homeschool`**

Run the existing development command on its configured port. Use browser automation against the actual rendered route.

- [ ] **Step 2: Verify desktop and mobile layouts**

At desktop and mobile viewports, inspect the hero, five reveals, FAQ, form, header link, footer, focus order, overflow, image quality, and console.

- [ ] **Step 3: Verify motion and form states**

Confirm scroll-linked transforms settle correctly, reduced motion presents static content, required fields block invalid submission, and an API failure preserves form values with a retry message.

- [ ] **Step 4: Capture final screenshots**

Save representative desktop and mobile screenshots for the handoff.

### Task 8: Refresh project knowledge and close the session

**Files:**
- Update: `graphify-out/GRAPH_REPORT.md`
- Update: `graphify-out/graph.json`
- Update if supported: `graphify-out/graph.html`

**Interfaces:**
- Consumes: all source and documentation changes.
- Produces: current architecture map and a clean, reviewable commit.

- [ ] **Step 1: Run Graphify update**

Run: `graphify update .`  
Expected: updated report and graph JSON. If HTML is skipped because the graph exceeds the visualiser limit, record that exact reason.

- [ ] **Step 2: Run final status and diff review**

Separate task changes from pre-existing user changes. Confirm no `.turbo`, build, or temporary artefacts are staged.

- [ ] **Step 3: Commit only the completed feature files**

Use a commit message that explains the new landing page, dedicated lead capture, and search contract.

- [ ] **Step 4: Mark the active goal complete only after the requirement audit passes**

Confirm every explicit objective has direct evidence: page, waitlist storage, SEO/AEO, five screen reveals, navigation link, tests/builds, browser checks, and Graphify update.
