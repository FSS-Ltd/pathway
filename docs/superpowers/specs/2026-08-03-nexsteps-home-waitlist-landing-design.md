# NexSteps Home Waitlist Landing Page Design

**Owner:** Technical Agent  
**Status:** Approved for implementation  
**Created:** 3 August 2026  
**Last updated:** 3 August 2026

## Problem statement

NexSteps Home has an approved product contract and strong mobile wireframes, but no public page that explains the product to home-educating families or captures launch interest. The existing marketing site also has no Homeschool navigation entry.

The page must introduce NexSteps Home in language a parent can understand immediately, demonstrate the product through approved screens, answer common search and answer-engine questions, and collect a privacy-conscious waitlist submission.

## Goals

- Publish an indexable `/homeschool` landing page for UK home-educating families.
- Add `Homeschool` to the primary marketing navigation and the relevant footer group.
- Reuse approved NexSteps Home screens to show Week, Today, Progress, Community, and Preparedness.
- Create cinematic, scroll-linked product reveals using the existing Framer Motion dependency.
- Collect first name, email, UK nation or region, home-education stage, and explicit marketing consent.
- Store submissions through a dedicated API boundary without collecting child data.
- Provide complete metadata, canonical URL, social cards, sitemap inclusion, semantic headings, direct-answer copy, FAQ content, and JSON-LD.
- Preserve accessibility, responsive behaviour, and reduced-motion support.

## Non-goals

- Pricing, checkout, account creation, or self-service onboarding.
- Collecting child names, ages, dates of birth, photos, or learning records.
- Promising legal compliance or presenting NexSteps as a legal adviser.
- Reworking the wider marketing site or its visual system.
- Adding a new database table or lead enum.

## Audience and positioning

The primary audience is a UK parent who is exploring home education, preparing to begin, actively home educating, or returning after a break.

The opening position is direct: NexSteps Home brings calm structure to home education without making home feel like school. The supporting story moves through five outcomes:

1. Plan a family week in one view.
2. Know what needs attention today.
3. Keep a descriptive record of learning and evidence.
4. Find opted-in, adults-only community connections safely.
5. Keep official information, evidence, and deadlines organised in one place.

The preparedness section must state that NexSteps organises information and evidence but does not provide legal advice or guarantee compliance.

## Experience design

### Visual direction

The recommended direction is cinematic editorial product storytelling. It combines generous off-white space, charcoal type, mint light, restrained yellow accents, and approved mobile screens presented as luminous product objects.

The hero opens with a concise category statement and a waitlist anchor CTA. A layered device composition establishes the product before the page enters five scroll chapters. Each chapter uses a tall sticky region. As the user scrolls, the product screen moves from a distant tilted state into a crisp front-facing state while the matching outcome copy resolves beside it. This creates the requested Apple-style reveal without video, canvas, or a new dependency.

Motion is progressive enhancement. With reduced motion enabled, every chapter becomes a static, readable two-column section with no scroll-linked transforms.

### Screen selection

- `week-home.png`: strongest planning overview and clearest first product reveal.
- `today.png`: communicates immediate focus and a calm daily rhythm.
- `progress-overview.png`: demonstrates records, evidence, and non-punitive progress language.
- `community-home.png`: shows the adults-only, privacy-first community promise.
- `regulations-overview.png`: shows preparedness, verified guidance, evidence links, and correspondence.

The welcome screen informs the hero copy but is not required as a sixth reveal because it repeats the landing-page proposition rather than showing a distinct workflow.

### Page sequence

1. Hero with category label, H1, direct answer, primary waitlist CTA, and layered Week/Today screens.
2. Short answer block: “What is NexSteps Home?” in two direct sentences.
3. Five product chapters using the approved screens.
4. Trust strip covering privacy, adults-only Community, descriptive progress, and UK-first preparedness.
5. FAQ with useful answers to real search questions.
6. Waitlist form with consent, feedback states, and a privacy link.
7. Closing line reinforcing calm structure rather than school administration.

## Architecture and boundaries

### Web

- The route page remains a server component and owns metadata, JSON-LD, and static content.
- Motion and form interactivity live in focused client components under `apps/web/components/homeschool/`.
- Product chapter data and FAQ copy live in a typed content module so rendered content and structured data cannot drift.
- Approved screenshots are copied into `apps/web/public/images/homeschool/` and rendered with `next/image` using meaningful alt text.

### API

- Add `POST /leads/homeschool` with a strict Zod DTO.
- Store the lead as existing `LeadKind.TRIAL` with `sector: "homeschool"` and structured `metadataJson` containing region, stage, and consent timestamp.
- Scope idempotency to recent homeschool-sector trial leads so a general trial submission does not overwrite a homeschool submission.
- Keep UTM attribution using the current lead-capture pattern.
- No schema migration is required.

### Data contract

```ts
type CreateHomeschoolLeadPayload = {
  firstName: string;
  email: string;
  region: "england" | "wales" | "scotland" | "northern-ireland" | "outside-uk";
  stage: "exploring" | "preparing" | "home-educating" | "returning";
  consentMarketing: true;
  utm?: {
    source?: string;
    medium?: string;
    campaign?: string;
  };
};
```

## SEO and AEO contract

- Absolute title: `Homeschool Planner App for UK Families | Nexsteps`.
- Canonical URL: `https://nexsteps.dev/homeschool`.
- One descriptive H1 aligned with the parent’s search intent.
- Open Graph and Twitter metadata with the Week screen as the product image.
- Indexable sitemap entry with high priority.
- `WebPage`, `SoftwareApplication`, and `FAQPage` JSON-LD using text already visible on the page.
- A direct answer near the top that defines the product in extractable language.
- Question-style H2s where they reflect real parent intent, followed immediately by an answer.
- Natural use of home education, homeschool planner, learning records, evidence, family week, community, and UK guidance.
- Internal links to privacy and the main NexSteps site experience.
- Descriptive image alt text. Decorative duplicates use empty alt text.

## Accessibility

- Semantic landmarks and heading order.
- A keyboard-accessible anchor CTA and labelled form controls.
- Minimum 44px interactive targets.
- Visible focus states.
- `aria-live` status feedback for submission results.
- Motion disabled through `useReducedMotion` and CSS `prefers-reduced-motion` treatment.
- No information communicated through colour or animation alone.
- Contrast targets WCAG 2.2 AA.

## Failure modes

- Invalid input: native validation plus matching server-side Zod validation.
- Consent absent: submission is rejected at both client and API boundaries.
- API failure: preserve all entered values, show a calm error, and allow retry.
- Duplicate submission: update a recent matching homeschool lead rather than create noise.
- JavaScript unavailable: all product copy, FAQ content, and screenshots remain server-rendered and indexable; only submission interactivity is unavailable.
- Reduced motion: render static product chapters without scroll transforms.

## Verification

- API unit tests for DTO validation, metadata persistence, and homeschool-scoped idempotency.
- Web contract tests for the route, navigation, metadata, JSON-LD, sitemap, form fields, and screenshot assets.
- Typecheck and lint for both `@pathway/web` and `@pathway/api`.
- Focused unit tests and production builds for both affected applications.
- Browser checks at desktop and mobile widths, including keyboard use, success/error states where practical, reduced motion, console errors, layout overflow, and visual fidelity.
- Graphify update after all code and documentation changes.

## Rollback

Remove the `/homeschool` route and components, revert the navigation/footer/sitemap entries, remove the copied image assets, and remove the homeschool lead endpoint and client method. No database rollback is needed because the design uses the existing lead table and enum.

## Trade-offs

- Using static screen imagery provides high fidelity and fast loading but does not demonstrate live interaction. The scroll treatment supplies depth without pretending the screenshots are interactive.
- Reusing `LeadKind.TRIAL` avoids a database migration. The dedicated sector tag and metadata campaign marker preserve reporting separation.
- Framer Motion adds client-side code to the reveal sections, but it is already installed and gives robust scroll progress and reduced-motion handling.

## Success criteria

- `/homeschool` renders a visually polished, responsive landing page with five approved screen reveals.
- `Homeschool` is reachable from desktop and mobile navigation.
- The form collects exactly the approved fields and persists a tagged lead.
- Search metadata, sitemap, visible direct answers, FAQ, and matching structured data are present.
- No child data is requested.
- Relevant tests, typechecks, lint checks, builds, browser verification, and Graphify update pass.
