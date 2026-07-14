# Per-org logo — mobile (design note, no code this run)

Companion to `docs/design/per-org-logo.md`, which shipped the schema
(`Org.logoStorageKey`/`logoContentType`), the `GET /orgs` `logoUrl` field, and the
admin-web brand swap. This note describes how the mobile app *should* pick up the same
org logo later. **No mobile code ships in this PR** — this is a plan for a follow-up.

## What should change

`BrandLogo` (`apps/mobile/src/components/primitives/brand-logo.tsx`) currently always
renders the bundled `NSLogo.svg`:

```tsx
import NSLogo from "../../../assets/NSLogo.svg";

export function BrandLogo({ width = 112, height = 40 }: BrandLogoProps) {
  return <NSLogo width={width} height={height} />;
}
```

It's used on the auth screens via `Screen` (`apps/mobile/src/components/primitives/
screen.tsx:76`). Once a user is in an org context (post sign-in, or on a returning
device that already knows its org), `BrandLogo` should render that org's uploaded logo —
fetched from the same `GET /orgs` response (`logoUrl` field, already shipped) the admin
web app reads — falling back to the bundled `NSLogo.svg` exactly as `BrandMark` does on
web (`apps/admin/app/admin-shell.tsx`).

## Why this is a separate problem from the web version, not a copy-paste

- **No `<img onError>` equivalent.** React Native's `<Image>` has an `onError` callback,
  but the "swap to a different local asset on failure" pattern needs explicit state
  handling — same idea as `BrandMark`, but a different component API.
  `React Native's `<Image source={{ uri }}>` also doesn't share a loader with a
  bundled SVG import (`NSLogo.svg` is compiled in via `react-native-svg-transformer`;
  a remote PNG/JPEG from Supabase is a runtime `<Image>` fetch) — the fallback needs to
  switch between two different rendering paths, not just two URLs.
- **Caching matters more on mobile.** Web re-fetches `GET /orgs` on every admin-shell
  mount over a fast connection. Mobile needs the logo available immediately on cold start
  (before any network round-trip resolves) so the auth screen doesn't flash bare/blank —
  which means caching the resolved logo URL (or the image itself) locally, e.g. via
  `expo-file-system` or `AsyncStorage`, keyed by org id, and only refreshing in the
  background. Web has no equivalent cold-start constraint.
- **No org context before sign-in.** Unlike a returning web session, a fresh mobile
  install has no org to ask `GET /orgs` about until the user has signed in at least once.
  The very first auth-screen render, on a fresh install, has no choice but to show the
  bundled `NSLogo.svg` — the design only applies to *returning* users on a device that has
  a cached org id.

## What stays NexSteps regardless

The splash/startup screen is a **build-time native asset**, not something `BrandLogo`
renders — `Nexsteps.png` is baked into the app binary via `app.config.ts`/`app.json`
(`icon`, `splash.image`, and the Android adaptive-icon `foregroundImage` all point at
`./assets/Nexsteps.png`), plus the corresponding native iOS launch storyboard and Android
drawable resources generated from it at build time. None of that can vary per-org: it
renders before the app has fetched anything, let alone resolved which org a signed-in
user belongs to. It stays NexSteps by construction, the same way the web favicon and
`/login` route stay NexSteps.

## Suggested follow-up scope (not estimated/committed here)

1. A small `fetchOrgLogoUrl()` client call (mirrors `fetchOrgOverview` on web) plus a
   cache layer (org id → last-known logo URL, or the downloaded bytes).
2. `BrandLogo` gains an optional org-context lookup; falls back to `NSLogo.svg` when no
   cached/fetched URL exists — mirrors `BrandMark`'s `onError` fallback intent, but
   implemented as a load/cache state machine appropriate to React Native's `<Image>`.
3. No changes to `app.config.ts`, `app.json`, the iOS storyboard, or Android drawables —
   those stay NexSteps.
