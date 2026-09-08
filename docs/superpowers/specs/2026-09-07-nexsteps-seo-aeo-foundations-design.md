# Nexsteps SEO and AEO Foundations

Owner: Technical Agent
Status: Implemented
Created: 7 September 2026
Last updated: 7 September 2026
Related brief: `nexsteps-seo-aeo-audit-dev-brief-2026-09-06.txt`

## Problem statement

High-value marketing routes inherited the homepage canonical, the sitemap omitted commercial pages, metadata differed between route families, and animation wrappers could leave important content hidden before JavaScript completed. Pricing and article templates also contained semantic and entity inconsistencies.

## Goals

- Give every approved public route a self-referencing `https://www.nexsteps.dev` canonical.
- Generate consistent titles, descriptions, Open Graph and Twitter metadata from a typed registry.
- Include all approved commercial routes in the sitemap without invented modification dates.
- Keep important content visible in initial HTML while retaining the existing scroll and entrance motion.
- Improve pricing, article, feature and sector semantics without redesigning the site.
- Add Organization, BlogPosting and breadcrumb structured data where the underlying facts are known.
- Make blog pagination addressable and crawlable.

## Non-goals

- No framework migration, new dependency, database migration or production deployment.
- No unverified security, compliance, hosting, product or pricing claims.
- No bulk article campaign, `llms.txt` project or redesign.
- No Search Console, analytics or external index changes without owner access.

## Architecture

`apps/web/lib/seo.ts` is the single source for the public origin, public-route metadata, sitemap entries and shared structured-data builders. Route files consume this module through the Next.js metadata API. JSON-LD is rendered through a small escaping component. Blog pagination and article-body cleanup remain separate focused helpers.

Motion stays progressively enhanced. Existing Framer Motion timelines, transforms, stagger and parallax remain, but indexable content now starts at opacity 1. Transforms still produce the existing movement when JavaScript runs.

## Implementation notes

- The approved canonical host is `www.nexsteps.dev`; apex requests permanently redirect while preserving path and query.
- Preview deployments receive `noindex, nofollow` through metadata and `X-Robots-Tag` when `VERCEL_ENV` is not `production`.
- NexSteps Home remains a distinct product route and is not added to the organisation configurator's institutional vertical options.
- The security page uses scoped, buyer-verifiable wording. It does not claim a certification, legal conclusion or private application data location.
- Product imagery is labelled as synthetic demonstration data where it appears on the homepage.
- A missing live API is handled by existing content and pricing fallbacks. The production build can therefore finish, although the unavailable service logs non-fatal fetch errors.

## Verification

- ESLint, strict TypeScript, Jest and the Next.js production build pass.
- Browser checks cover desktop and mobile layouts, one H1 and one main landmark, canonical output, structured data, visible-first content, scroll-stage changes, pricing's unselected state, sitemap output, apex redirects and the noindexed 404.

## Remaining owner work

- Capture Search Console selected canonicals, indexing coverage and before/after baselines.
- Review and approve named author biographies and editorial ownership.
- Maintain the security evidence inventory and publish only verified controls.
- Decide whether the current article inventory warrants further editorial work after the technical foundation is observed in search data.

## Rollback

Revert this change set. No schema, dependency or external-service migration is involved.
