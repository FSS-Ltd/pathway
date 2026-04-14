# Claude/Cowork Blog Automation Runbook

This guide documents how to use the new token-authenticated API to create and publish blog posts from Claude/Cowork.

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
