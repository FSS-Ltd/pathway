# Design Doc: NexSteps Scroll-Driven Landing Hero

**Status:** Approved for build (session 2026-07-02)
**Branch:** `feat/web-scroll-hero`
**Owner:** Technical Agent

## Problem

The nexsteps.dev homepage hero is a static two-column text section. It does not
communicate the core transformation NexSteps sells: fragmented day-to-day admin
(spreadsheets, group chats, rotas, safeguarding notes, emails, reports) pulled
into one calm, auditable system so staff can better support children.

Goal: an award-level, scroll-driven cinematic hero ("From Admin Chaos to
Coordinated Care") that scrubs a 3D motion-design video with scroll, overlays a
staged copy timeline in live HTML, ends on the NexSteps logo with the tagline
"Forward together", then hands off to the existing landing page sections.

## Architecture

- **Video**: one 15s continuous dolly-forward master shot generated with
  Higgsfield (Seedance 2.0, 1080p, 16:9, silent). The video converges into an
  abstract luminous emblem — the real NexSteps logo is *not* baked in. All
  text and the logo render as DOM for crispness, brand accuracy and
  accessibility.
- **Component**: `apps/web/components/hero/nexsteps-parallax-hero.tsx`
  (client component). Replaces `HeroSection` on `(marketing)/page.tsx`.
- **Scroll rig**: outer wrapper ~550vh; inner `position: sticky; top: 0;
  height: 100svh`. framer-motion `useScroll` (already a dependency — no GSAP
  added) provides progress 0–1.
- **Video scrub**: progress maps to `video.currentTime` via a
  requestAnimationFrame lerp loop (direct seeking on scroll events is
  chunky; lerp smooths it). Video is `muted playsInline preload="auto"
  aria-hidden`.
- **Copy timeline** (DOM overlays, opacity/translate driven by
  `useTransform`):
  - 0–15%: "Your day should not run in five different places."
  - 15–35%: "When systems are disconnected, support gets harder to deliver."
  - 35–55%: "NexSteps brings the workflow together."
  - 55–75%: "One auditable system of record."
  - 75–88%: "Less time chasing systems. More time supporting children."
  - 88–100%: NexSteps logo (SVG, glow), "Forward together", CTAs
    (Book a demo → /demo, See how it works → /features/attendance).
- **Handoff**: final logo settles top-centre; page scrolls on into
  `WhyNexsteps` and the rest of the existing landing sections unchanged.

## Key decisions

1. **DOM logo instead of baked-in logo** — AI video cannot reproduce the exact
   mark; SVG overlay is crisp, retina-safe and on-brand. The video ends on an
   abstract glow the logo visually replaces.
2. **framer-motion over GSAP** — already installed; avoids a new dependency
   for one component.
3. **15s master instead of 20–30s** — provider hard limit per generation.
   Scrub feel depends on scroll distance, not clip length; 360 frames over
   550vh is smooth. Avoids multi-clip stitching seams.
4. **Short-GOP re-encode** — scrubbing requires dense keyframes. Master is
   re-encoded with `-g 8` (H.264 CRF ~26 + VP9 webm), target ≤ 12 MB each,
   poster webp extracted from the calm final frame.

## Data model

None. Static assets in `apps/web/public/hero/`:
`nexsteps-hero-scroll.webm`, `nexsteps-hero-scroll.mp4`,
`nexsteps-hero-poster.webp`.

## Failure modes & resilience

- **Video fails to load / slow network**: poster + gradient render beneath the
  video element; copy timeline still works (DOM-driven), so the hero degrades
  to a scroll narrative over a still image.
- **`prefers-reduced-motion`**: no pin, no scrub — static calm poster with
  headline, tagline and CTAs.
- **Small screens**: same rig (16:9 video covers via `object-cover`), shorter
  scroll (reduced vh), copy sizes step down.
- **JS disabled / SSR**: first copy stage, logo, tagline and CTAs are in the
  server-rendered HTML.

## Security & privacy

Static marketing assets only. No personal data, no third-party branding in
the generated video (generic green chat bubbles, abstract silhouettes).

## Rollout & rollback

Ships as one PR replacing `HeroSection` usage on the homepage only; the old
component stays in the tree. Rollback = revert the one-line import swap.

## Success metrics

- First 3 seconds of scroll read as "too many disconnected systems".
- Convergence into NexSteps is legible mid-scroll; tagline feels earned.
- Lighthouse: no CLS from the hero; video lazy of critical path (poster
  paints first); text contrast ≥ WCAG AA over video via gradient scrims.
- Works without sound; meaning never depends on burned-in video text.
