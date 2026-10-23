# Claude/Cowork Blog Automation Runbook

This guide documents how to use the new token-authenticated API to create and publish blog posts from Claude/Cowork.

## Daily editorial run

The existing `nexsteps-blog-post-automation` runs every day at 06:00 Europe/London. The submit script accepts 06:00 through 06:29 on every day. Publish at most one article for a scheduled run; do not catch up missed days with a batch. Never use `--ignore-schedule-window` in a scheduled run. A missed window or failed quality gate means no publication.

1. Read the live published-post list from the paginated `GET /public/blog/posts` endpoint before selecting or retrying a topic. Follow `nextCursor` until exhausted and put those posts in the candidate's `existingPosts` fallback context, because the authenticated list endpoint may return 404. Compare slugs, titles, search intent, excerpts and keyword clusters. Check automation memory and the live list for a confirmed automation publication on the current Europe/London date; if one exists, stop. For an uncertain prior outcome, verify its slug against the live list before retrying. Reuse the same candidate and slug if it is still unpublished; never select a second topic for the same scheduled run.
2. Determine the next slot from confirmed published automation articles, using this repeating sequence: homeschooling, ACE, homeschooling, ACE, other relevant Nexsteps audience. Count a topic serving both homeschooling and ACE once, in its selected slot. Advance the sequence only after publication is confirmed. If the slot has no defensible unpublished topic, report the blocker and keep the slot.
3. Use the `firecrawl-search`, `keyword-research` and `keyword-clustering` skills. Read the Nexsteps OpenSEO project context, key pages and research log first. Reuse matching research from the last 30 days. Search for genuine UK questions, gather credible source pages with Firecrawl, measure UK search volume and difficulty in OpenSEO, and group terms by search intent and suitable page. Select the highest-volume relevant unanswered question for the current slot. Break ties by product relevance, achievable difficulty, then research freshness. Do not add close-variant volumes together or invent missing metrics. ACE means Accelerated Christian Education, including PACE learning, Christian schools and home-education communities; homeschooling also includes questions beyond software administration.
4. If fresh keyword metrics are unavailable, use a verified, unpublished question researched within 30 days. Confirm its source links and current fit against the live post list. If neither live research nor a verified backlog supports an article, stop and report the blocker. Record the chosen question, audience, cluster, source URLs, metric date, UK search volume or `unknown`, and selection rationale in the topic ledger or automation memory. Keep research reports and unpublished opportunities in OpenSEO when available. Record the published URL and slot in automation memory only after confirming publication.
5. Use Design Craft's article/editorial guidance to write an answer-first article in UK English. Include useful examples, clear headings, short paragraphs, cited sources and contextual internal links. Add tables or checklists only when they improve the answer. Check jurisdiction-sensitive advice against current primary sources and verify every Nexsteps product claim. Generate valid TipTap JSON for the current blog renderer and run the existing candidate QA before submission.
6. Create one original 1200×630 cover per article. Use pages 1–2 of `Nexsteps-CEE-Schools-Presentation-with-About.pdf` as the illustration reference, ignoring its UI screenshots: a softly painted storybook look, subtle paper texture, natural light, fictional expressive people, cream, forest green, mint, warm wood and restrained ochre. Vary scenes and compositions across runs. Show relevant families, learners, educators, books and learning materials; avoid photorealistic stock imagery, product dashboards and text baked into the image. Inspect the cover before submission, add descriptive alt text, record the real namespaced generator in `coverImage.generatedBy`, and list only actual reference assets in `coverImage.sourceAssets`.
7. Submit once through `node scripts/blog-automation/submit.mjs --candidate /tmp/nexsteps-blog-candidate.json`. Retain a failed candidate for safe retry. On an uncertain response, recheck the live slug before any retry. Do not bypass authentication, duplicate, schema, image, quality or schedule gates. The script's `--dry-run` currently uploads the cover before its dry-run check; use `validateBlogAutomationCandidate` directly for local validation without publication or upload.

## 1) Apply the database migration

Run the Prisma migration so automation token tables exist.

```bash
pnpm --filter @pathway/db run prisma:migrate:dev
```

For production deploys, use your deploy migration command instead.

## 2) Start the API

```bash
pnpm --filter @pathway/api dev
```

## 3) Create an automation token (admin-only)

Only Nexsteps `superUser` users can create/revoke automation tokens.

Endpoint:

- `POST /admin/blog/automation/tokens`

Payload example:

```json
{
  "name": "claude-cowork",
  "expiresAt": null
}
```

`curl` example:

```bash
curl -X POST "$API_BASE_URL/admin/blog/automation/tokens" \
  -H "Authorization: Bearer $ADMIN_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"claude-cowork","expiresAt":null}'
```

Response includes a raw `token` value once. Save it in Claude/Cowork secrets.
Do not commit this token or paste it in prompts.

## 4) Configure Claude/Cowork secret

Store the raw token from step 3 in Claude/Cowork secret storage (for example `PATHWAY_BLOG_AUTOMATION_TOKEN`).

Also configure your API base URL (for example `https://api.your-domain.com`).

## 5) Publish a post via automation endpoint

Endpoint:

- `POST /automation/blog/posts`

Auth header:

- `Authorization: Bearer <automation_token>`

Payload (v1):

- `title` (required)
- `slug` (required, lowercase-hyphenated)
- `contentJson` (required, TipTap JSON object)
- `excerpt` (optional)
- `seoTitle` (optional)
- `seoDescription` (optional)
- `tags` (optional string array)
- `thumbnailImageId` (optional UUID or `null`)
- `headerImageId` (optional UUID or `null`)

`curl` example:

```bash
curl -X POST "$API_BASE_URL/automation/blog/posts" \
  -H "Authorization: Bearer $PATHWAY_BLOG_AUTOMATION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "How to Reduce Attendance Admin in Schools",
    "slug": "reduce-attendance-admin-schools",
    "excerpt": "Practical workflow tips for education teams.",
    "contentJson": {
      "type": "doc",
      "content": [
        {
          "type": "paragraph",
          "content": [{ "type": "text", "text": "Start with one high-friction task..." }]
        }
      ]
    },
    "tags": ["attendance", "schools"],
    "seoTitle": "Reduce Attendance Admin in Schools",
    "seoDescription": "Practical steps to reduce attendance admin workload."
  }'
```

Success response:

```json
{
  "id": "...",
  "slug": "reduce-attendance-admin-schools",
  "status": "PUBLISHED",
  "publishedAt": "2026-04-09T...Z",
  "url": "https://.../blog/reduce-attendance-admin-schools"
}
```

### Optional: upload images for blog posts

Cover images are optional, but generated images must carry honest provenance.
Accepted automation image sources are:

- `local:gpt-image-2` for the local generation path.
- `codex:image_gen` for images generated with Codex's built-in image generation tool in the current automation thread.

Do not label a Codex-generated image as `local:gpt-image-2`. Do not use third-party
remote image URLs, stock imagery, or manually sourced images as automation cover
images unless a human explicitly approves that source for the post.

Candidate `coverImage` metadata should include:

```json
{
  "fileBase64": "...",
  "mimeType": "image/png",
  "type": "HEADER",
  "width": 1200,
  "height": 630,
  "altText": "Brief descriptive alt text for the generated cover image.",
  "generatedBy": "codex:image_gen"
}
```

Endpoint (preferred):

- `POST /automation/blog/assets`

Legacy alias (still supported for older clients):

- `POST /automation/blog/media`

Auth header:

- `Authorization: Bearer <automation_token>`

Payload:

- `fileBase64` (required, base64 file bytes)
- `mimeType` (required, one of `image/png`, `image/jpeg`, `image/webp`)
- `type` (optional, one of `THUMBNAIL`, `HEADER`, `INLINE`; defaults to `INLINE`)
- `width` (optional positive integer)
- `height` (optional positive integer)

`curl` example:

```bash
curl -X POST "$API_BASE_URL/automation/blog/assets" \
  -H "Authorization: Bearer $PATHWAY_BLOG_AUTOMATION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "fileBase64": "'"$(base64 < ./header-image.png | tr -d '\n')"'" ,
    "mimeType": "image/png",
    "type": "HEADER",
    "width": 1200,
    "height": 630
  }'
```

Success response includes `id` and canonical `url` like `https://.../media/<assetId>`.
Use the returned `id` as `thumbnailImageId` or `headerImageId` in `POST /automation/blog/posts`.

## 6) Revoke a token (if leaked or rotated)

Endpoint:

- `DELETE /admin/blog/automation/tokens/:id`

`curl` example:

```bash
curl -X DELETE "$API_BASE_URL/admin/blog/automation/tokens/$TOKEN_ID" \
  -H "Authorization: Bearer $ADMIN_ACCESS_TOKEN"
```

## 7) Operational safety notes

- Raw tokens are not stored in DB; only SHA-256 hashes are stored.
- Automation endpoint enforces bearer-token auth separate from user JWT guards.
- Per-token in-memory rate limiting is enabled (default `30/min`, configurable via `BLOG_AUTOMATION_RATE_LIMIT_PER_MINUTE`).
- Each publish writes an audit record with token and post metadata.
- Revalidation is triggered for `/blog` and `/blog/:slug` after publish.

## 8) Common failure cases

- `401 Unauthorized`: Missing/invalid/revoked/expired automation token.
- `400 Bad Request`: Invalid payload (often bad slug format or malformed `contentJson`).
- `429 Too Many Requests`: Token exceeded per-minute rate limit.
- Slug conflict: Returned when `slug` is already in use.
