# Web SEO and performance review, 2026-10-24

Scope: `apps/web` (nexsteps.dev). Inputs were three Search Console coverage
exports and the PageSpeed Insights reports for mobile and desktop.

## Scores

| | Performance | Accessibility | Best Practices | SEO |
|---|---|---|---|---|
| PageSpeed, production, mobile | 90 | 96 | 96 | 100 |
| PageSpeed, production, desktop | 99 | 96 | 96 | 100 |
| This branch, mobile (local, HTTP/2, 5 runs) | 99 | 100 | 100 | 100 |
| This branch, desktop (local, HTTP/2, 3 runs) | 100 | 100 | 100 | 100 |

Local runs use Lighthouse 13.5.0, the version PageSpeed ran, with its default
mobile throttling. They are not a PageSpeed run. Re-run PageSpeed after deploy.

Over plain HTTP/1.1 (`next start` without a proxy) mobile Performance is 95,
because Lighthouse's simulation serialises requests over six connections.
Vercel serves HTTP/2, so the proxied number is the closer one. The production
baseline measured the same way swings between 99 and 91 from run to run. The
91 run matches PageSpeed's 3.6 s LCP, so PageSpeed's 90 was most likely the
unlucky side of a race between first paint and script evaluation rather than a
stable result. That is an inference from the run-to-run split, not something
Lighthouse reports directly.

## What changed

Accessibility
- `text-accent-strong` was `#0f9d82`, 3.1:1 on light surfaces. Text now uses
  `--pw-accent-text` (`#0c7a65`, 4.56:1 on the darkest tint). Backgrounds,
  borders and rings keep the brand teal, because only Tailwind's `textColor`
  is extended.
- Footer version label opacity 70% to 85% (3.6:1 to 5.2:1).

Best Practices
- Removed `upgrade-insecure-requests` from the report-only CSP. Browsers ignore
  it there and log a console error.

Performance
- `NSLogo.svg` and `favicon.svg`: 296 KB to 14.7 KB. They were an 800 px bitmap
  wrapped in SVG. Same wrapper, 400 px WebP, PSNR 43 dB or better at 336 px.
  The logo was preloaded in `<head>` for a 32 px header image.
- Hero poster: phones in portrait only see the centre of the 16:9 frame, so they
  get a pre-cropped 23 KB file (was 74 KB) through a media query, with a
  media-scoped preload. Other viewports keep the 4K poster.
- Removed `priority` from the product screenshot, which sits below a 550vh hero.
- Removed the video's duplicate `poster` attribute. The same image is already
  the hero background underneath.
- `/blog` shipped about 590 KB of inline data because the list endpoint returns
  every article body and the index passed them to a client component. The index
  now keeps summaries only.

SEO hygiene
- `/privacy` and `/user-agreement` hard-coded "| Nexsteps", and the root
  template adds it again. Both rendered "| Nexsteps | Nexsteps".

## Why the Search Console pages are not indexed

Technical audit of all 66 sitemap URLs: every page returns 200 with one H1, a
meta description, a self-referencing canonical on `www`, `index, follow`, and
a 0.2 to 1.2 s response. A Googlebot user agent gets byte-identical responses.
Nothing blocks indexing.

- Page with redirect (12). The apex to `www` 308 is intended. The entries are
  apex URLs discovered in the past. Current HTML, RSS and OG tags contain no
  apex URLs. No action; the status stays while anything external links to apex.
- Crawled, currently not indexed (12). CSS files and `/media/<id>` images are
  resources, not pages. `http://nexsteps.dev/terms` and `/cookies` are redirect
  sources. The five blog posts are early commercial-angle posts (506 to 954
  words, "... software for ..."). The same five also appear as apex duplicates.
  Google does not say why. The likely reasons are a generic "Nexsteps" byline, two
  inbound internal links each, and a crowded keyword niche.
- Discovered, currently not indexed (30). All are in the sitemap and linked from
  the server-rendered nav and footer, so discovery is not the problem. They are
  the thinnest, most templated pages: `/features/*` and the sector pages carry
  157 to 181 words of body copy, `/toolkit` 67, `/trial` 88, `/readiness-score`
  51. On a young domain a common cause is Google deferring the crawl of pages it
  predicts are low value. Google does not report that reason either.

The most likely cause is content depth and authority, not configuration. Code
cannot fix that without writing copy, so these are left for a decision:

1. Expand `/features/*` and the five sector pages to 400+ words each with
   specifics (workflow, a worked example, who it is for). Highest impact.
2. Add a "Related guides" list to each feature and sector page, and a link from
   each guide back to its feature page. Visible change, so not made here.
3. Replace the generic "Nexsteps" byline with a named author and Person schema.
4. After deploy, use Request Indexing on the home page, the five sector pages and
   `/features/attendance`, then Validate Fix on the redirect bucket.
5. Backlinks. Nothing in the codebase substitutes for them.

## Tried and dropped

- Inlining the compiled CSS: the stylesheet is about 100 KB raw, so inlining
  made FCP and LCP worse. Next 14.2's App Router has no critical-CSS option.
- `browserslist` for modern browsers: no effect. Next's polyfill module is
  1.4 KB, so the "legacy JavaScript" estimate overstates the saving.
- `LazyMotion` for the three home components: saved 25 KB of JS and about one
  point, but scroll-linked hero values can show a stale server value until the
  first scroll. Reverted to keep the hero identical.

## Verification

- `pnpm --filter @pathway/web typecheck`, `lint` and `jest` pass.
- Visual comparison of production against this build at 412x823 and 1440x900.
  The first hero view scores SSIM 0.9991 (mobile) and 0.999999 (desktop). Every
  other capture scores 0.9998 or higher, except the three that show the phone
  mockups' repeating float animation (0.93 to 0.995), where the difference is the
  animation phase. Page heights are identical.
- Hero scroll-linked opacity and offset match production to four decimals at
  every sampled scroll position, including scroll 0 and a reload with a
  restored scroll position.

## Not changed

- `/configure`: Accessibility 96 and Best Practices 92 (red error text contrast,
  a console error). Existing, outside this scope.
- `/toolkit` submit button contrast, and no `<main>` landmark on the legal
  pages (Accessibility 98).
- The 7 MB hero video still loads after hydration. Changing that alters the
  scrub behaviour. It does not affect the scored metrics.
