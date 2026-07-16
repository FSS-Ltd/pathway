# Google Analytics: consent gate and dashboard fix

**Status:** Approved for build (session 2026-07-16)
**Branch:** `fix/google-analytics-cookie-consent`

## Problem

Google Analytics (`G-Q6R2DKLXV5`) has never reported data. Root cause:
`apps/web/components/google-analytics.tsx` only renders the `gtag.js` scripts
when `NEXT_PUBLIC_GA_ID` is set, and that var is absent from every environment
(`.env`, `apps/web/.env.local`, and the pulled Vercel production env) — so the
component has always returned `null` in production.

Separately, the public site's own `(legal)/cookies` and `(legal)/privacy`
pages tell users analytics runs on "a privacy-conscious, EU/UK-hosted
provider (e.g. PostHog)" and that no other third-party tracker is used. GA is
US-hosted and sets its own `_ga`/`_ga_*` cookies. There is no cookie-consent
mechanism anywhere on the site today. Turning GA on as-is would make the
live site's behaviour contradict its own published disclosures, on a product
that stores school/church/charity data including children's data. User chose
the compliant path: fix the env var, gate GA behind consent, and correct the
policy text.

Admin app (`apps/admin`) was audited and already has zero GA/gtag references
— no change needed there.

## Architecture approach and key decisions

- **Consent stored in a first-party cookie** (`ns_cookie_consent`,
  `"accepted" | "rejected"`, 1-year `max-age`), read/written by a small helper
  (`apps/web/lib/cookie-consent.ts`). A cookie (not localStorage) was chosen
  only because it's the simplest thing that already matches the "cookies" the
  policy pages describe — no new storage concept introduced.
- **One client component gates everything**:
  `apps/web/components/cookie-consent-banner.tsx` reads consent on mount,
  renders `<GoogleAnalytics />` only when `consent === "accepted"`, and shows
  an Accept/Decline banner only when no choice has been recorded yet. No
  context/provider layer — the existing `GoogleAnalytics` component is reused
  unmodified, just conditionally mounted instead of always-mounted.
- **`apps/web/app/layout.tsx`** swaps the direct `<GoogleAnalytics />` render
  for `<CookieConsentBanner />`.
- **No change to the existing `track()` analytics abstraction**
  (`apps/web/lib/analytics.ts`, PostHog/Plausible/custom-endpoint) — it was
  confirmed inert in every environment (no PostHog script is loaded anywhere,
  `NEXT_PUBLIC_ANALYTICS_ENDPOINT` is unset everywhere) and is out of scope
  for this fix, which is specifically about Google Analytics.
- **Policy text** (`(legal)/cookies`, `(legal)/privacy`) updated to name
  Google Analytics honestly and describe that it only loads after consent.
  Flagged to the user for a legal-counsel pass before relying on the exact
  wording — this is a live legal document for a product touching children's
  data, and this agent isn't a substitute for that review.
- **`NEXT_PUBLIC_GA_ID`** set via `vercel env add` for the web project,
  Production scope only (not Preview/Development), to avoid dev/staging
  traffic polluting the GA4 property. Requires explicit user confirmation
  before running since it changes shared Vercel project configuration.

## Data model

None. No new database fields; consent lives client-side in a cookie.

## Failure modes and resilience

- If `NEXT_PUBLIC_GA_ID` is unset, `GoogleAnalytics` still renders `null` —
  behaviour is unchanged from today in that case.
- If reading `document.cookie` throws or runs during SSR, `getStoredConsent`
  returns `null` (banner shows); no crash path.
- Users who already have GA's own `_ga` cookies from before this change: none
  exist, since GA has never successfully loaded in production.

## Security and privacy

- No PII is added. The consent cookie stores only `"accepted"`/`"rejected"`.
- GA still only loads client-side, same-origin script injection as before,
  now consent-gated.
- Recommend (not implemented here, outside code scope) confirming in the
  GA4 property admin UI that Google Signals / ads personalization features
  are off, so the "no advertising cookies" claim in the Cookie Policy stays
  true.

## Rollout and rollback plan

1. Merge code (banner + policy text). No behaviour change yet since
   `NEXT_PUBLIC_GA_ID` still unset until the env var step runs.
2. Set `NEXT_PUBLIC_GA_ID` in Vercel Production (separate, confirmed step).
3. Rollback: unset `NEXT_PUBLIC_GA_ID` (GA stops loading immediately, same
   as current state) and/or revert the banner commit — both are additive,
   independently revertible changes.

## Success metrics

- GA4 real-time dashboard shows events after Accept is clicked on the live
  site.
- Zero GA network requests before consent is given (verified in the browser
  network panel).
- Zero GA/gtag references remain in `apps/admin`.
