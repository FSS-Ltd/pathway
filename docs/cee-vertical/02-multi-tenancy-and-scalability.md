# 02 - Multi-Tenancy and Scalability

This is the document that makes "scalable from day one" concrete. It defines the tenancy hierarchy, the isolation model, and the engineering tactics that let the same architecture run at CEE's real scale today and at 10x without a rewrite.

## 1. Tenancy hierarchy

The existing model is two levels: `Org` (billing owner) → `Tenant` (Site, the isolation boundary). CEE needs a third concept above `Org` so that CEE Central can oversee many independent schools without those schools sharing a billing account or a data boundary.

```
Network (CEE)                         ← oversight + optional central billing
  ├── Org (School A)        SCHOOL    ← billing boundary, one per school
  │     └── Tenant/Site A1            ← RLS isolation boundary (data lives here)
  │     └── Tenant/Site A2  (multi-site school, optional)
  ├── Org (School B)        SCHOOL
  │     └── Tenant/Site B1
  ├── Org (TEACH households) TEACH    ← either one Org with many household Tenants,
  │     └── Tenant (household) ...        or one lightweight Org per household
  └── Org (CEE Central)     CEE_CENTRAL ← central team's own org + aggregate access
```

Rules:

- **`Network`** groups Orgs for oversight and optional network-level commercial agreements. It does **not** own child data. It owns membership, aggregate reporting access, central templates, and (optionally) a network subscription.
- **`Org`** stays the billing and entitlement boundary, exactly as today (`Subscription`, `OrgEntitlementSnapshot`, `UsageCounters` all hang off `Org`). Each school is one Org. This preserves school-level billing and clean onboarding.
- **`Tenant` (Site)** stays the data isolation boundary. Every tenant-owned row carries `tenantId`. This is the Row-Level Security key.
- **CEE Central** is an Org of type `CEE_CENTRAL` whose users get aggregate, permissioned, read-mostly access to the Network's reporting views. It is not a superuser over school data.

This satisfies the three commercial models in the brief (school-paid, CEE-funded network, hybrid) with one structure: who pays is a property of where the `Subscription` sits (per-school Org, or a Network-level agreement), and what CEE sees is a property of the Network reporting grant.

## 2. Tenant and org typing

Add discriminators so the same models behave correctly per surface, and so language and workflow adapt (school vs household) without separate tables.

- `Org.orgType`: `SCHOOL | TEACH_HOUSEHOLD | CEE_CENTRAL | PROGRAMME | INTERNAL`
- `Tenant.tenantType`: `SCHOOL_SITE | TEACH_HOUSEHOLD | CENTRAL | INTERNAL`
- `Org.networkId`: nullable FK to `Network`.

`INTERNAL` preserves the current `isMasterOrg` behaviour (non-billable NexSteps org). `isMasterOrg` is kept as-is and treated as `orgType = INTERNAL` for back-compat; new code reads `orgType`.

The surface a request targets is resolved from the authenticated membership plus `orgType` / `tenantType`, never from a client-supplied flag. Schema changes are detailed in `03`.

## 3. Isolation model

**Decision (D4): shared database, shared schema, `tenantId` on every tenant-owned row, Postgres Row-Level Security from day one, plus application-level guards.**

This matches the brief's MVP recommendation and adds RLS at the start rather than retrofitting it, because retrofitting RLS onto a populated children's-data system is expensive and risky.

### 3.1 Row-Level Security

The codebase today scopes by tenant in application code only (no RLS). For the CEE vertical we add database-enforced RLS as a second wall.

Pattern:

1. On each request, after authentication and membership resolution, the API opens its DB work inside a transaction that sets session GUCs:
   - `SET LOCAL app.current_tenant = '<tenantId>'`
   - `SET LOCAL app.current_org = '<orgId>'`
   - `SET LOCAL app.access_mode = 'tenant' | 'aggregate' | 'platform'`
2. Every tenant-owned table has an RLS policy:
   ```sql
   ALTER TABLE "Child" ENABLE ROW LEVEL SECURITY;
   CREATE POLICY tenant_isolation ON "Child"
     USING ("tenantId" = current_setting('app.current_tenant')::uuid);
   ```
3. The application database role is non-superuser and does not have `BYPASSRLS`. A separate migration role is used for schema changes.
4. CEE Central and Platform Admin use distinct access modes that map to reporting views and explicit grants, not to raw row access (04).

Why both RLS and application guards: RLS protects against a query that forgets its `where tenantId`, and against bugs in raw SQL or new endpoints. Application guards give clear 403s, good error messages, and protect logic that RLS cannot express (for example, cross-tenant aggregates that are legitimately allowed for CEE Central only).

### 3.2 Escape hatch for bespoke contracts

For a high-value bespoke enterprise contract that demands physical separation, the same code can target a separate database via a per-Network or per-Org connection resolver. This is the brief's "separate database per enterprise customer" option, available without code change because the data-access layer already resolves the connection per request context. It is not used for the default CEE rollout.

## 4. Scalability from day one

The platform is stateless where it can be and pushes all durable state into Postgres, Redis, and object storage. That is what lets it scale horizontally.

### 4.1 Stateless API tier

- The NestJS API holds no session state in process. Auth is token-based (Auth0 identities already modelled in `UserIdentity`). Any number of API instances run behind the load balancer.
- No sticky sessions. No in-process caches that must be coherent across instances; shared cache lives in Redis.
- Health and readiness endpoints already exist (`apps/api/src/health`) for the load balancer and autoscaler.

### 4.2 Postgres: the part that has to be designed, not just scaled

Postgres is the one tier you cannot fix later by adding instances, so it gets the most attention.

- **Connection pooling:** PgBouncer (transaction pooling) in front of Postgres. The API uses a bounded Prisma pool sized to the pooler, not to the database.
- **Read replicas:** route read-only and reporting queries (CEE Central dashboards, exports, list views) to replicas. The data-access layer exposes a "read" client and a "primary" client; reporting and aggregate endpoints use the read client.
- **Table partitioning** for the tables that grow without bound, partitioned by time and pruned by retention policy:
  - `Attendance`, `SessionStaffAttendance`
  - `AuditEvent` (already indexed by `createdAt`)
  - `StaffActivity`
  - `LearningLog` (new, TEACH)
  - `BillingEvent`
  Partitioning keeps indexes small, makes retention deletes cheap (drop a partition), and keeps writes fast as the network grows.
- **Indexes:** the current schema is already well indexed (composite indexes on `tenantId, createdAt` and friends). New tables follow the same rule: index every foreign key and every `(tenantId, <time or status>)` filter pair.
- **No N+1:** list and dashboard endpoints use explicit `include` / batched queries. This is enforced in review, not left to chance.

### 4.3 Caching (Redis)

- **Entitlement and permission resolution** is the hottest path (every request resolves the user's memberships, org plan, and caps via `EntitlementsService`). Cache the resolved entitlement snapshot per `(userId, orgId)` with short TTL and explicit invalidation on membership or subscription change.
- **Aggregate dashboards** (CEE Central, Platform Admin) cache computed rollups with a few-minutes TTL; freshness is not safety-critical for oversight numbers.
- **Rate limiting** per IP and per token sits in Redis.
- All cache keys are tenant-scoped or org-scoped. There is no global cache key that could leak across tenants.

### 4.4 Asynchronous work (BullMQ on `apps/workers`)

`apps/workers` already exists. It becomes the home for everything that should not block a request:

- Report bundle generation (TEACH export, school reports) and large exports.
- Notification fan-out (email via `mailer`/Resend, future SMS/push).
- Webhook ingestion and reconciliation for Stripe / GoCardless.
- Retention and DSAR jobs driven by `OrgRetentionPolicy`.
- Usage metering rollups (`UsageCounters`, `av30`).
- Internal staff billing margin rollups (06).

Queues give retry, backoff, idempotency, and dead-letter handling, so a slow third party or a heavy export never degrades the interactive app.

### 4.5 Object storage

Documents, evidence, child photos, and generated report bundles go to S3-compatible storage in an EU/London region (Supabase Storage is already used; `Child.photoKey`, `Lesson.fileKey`). Access is via short-lived signed URLs. The current inline `Bytes` fallbacks in the schema (`photoBytes`, `avatarBytes`, `resourceFileBytes`) are migrated off the database so large binaries never bloat Postgres or replicas.

### 4.6 Edge and CDN

The public marketing surface (`apps/web`) and static assets are served from the CDN/edge. Authenticated app traffic goes to the API tier. Public, cacheable endpoints (for example marketing pricing) already exist (`docs/PUBLIC_PRICING_ENDPOINTS.md`) and are edge-cacheable.

### 4.7 Multi-region readiness

First deployment is single-region (London) with replicas in-region. The architecture is region-pinnable: `Network` and `Org` can carry a `region` attribute so a future EU-mainland cohort can be pinned to an EU region for residency, with the connection resolver selecting the right database. This is designed in but not built for MVP.

### 4.8 Per-tenant metering and noisy-neighbour control

`UsageCounters` and `av30` already meter per org. Extend metering to cover API request volume, storage, and export jobs per tenant, so a single heavy tenant can be rate-limited or moved to a dedicated pool before it affects others. This is the practical meaning of "isolation" at scale: not just data isolation, but resource isolation.

## 5. Capacity model (sanity check)

CEE's real scale is small, which is the point: the architecture is sized for growth, but the first bill is tiny.

| Dimension | CEE today (realistic) | Design target (no re-architecture) |
|-----------|-----------------------|-------------------------------------|
| Schools (Orgs) | 11 to 40 | 500 |
| Sites (Tenants) | ~11 to 50 | 1,000 |
| Pupils (Child) | ~1,000 to 2,000 | 100,000 |
| TEACH households | 500 to 700 | 10,000 |
| Concurrent users (peak) | low hundreds | 10,000 |
| Attendance rows / year | low hundreds of thousands | tens of millions (partitioned) |

At CEE's real numbers, a single small Postgres with one replica, a single Redis, a couple of API instances, and one worker handles the load with headroom. The partitioning, replicas, and pooling are there so the same code carries the European rollout and the TEACH expansion without a redesign.

## 6. Failure modes and resilience

| Failure | Mitigation |
|---------|-----------|
| Forgotten `tenantId` filter in a new query | RLS blocks the rows; query returns empty, not someone else's data |
| API instance dies | Stateless tier; LB drains; another instance serves; no session loss |
| Postgres primary fails | Promote replica; RTO ≤ 1h; RPO ≤ 15 min from continuous backup |
| Third-party (Stripe, email) outage | Work is queued with retry/backoff; interactive app unaffected |
| Heavy export or report | Runs on `apps/workers`, never inline; bounded concurrency |
| Noisy tenant | Per-tenant rate limit and usage caps; optional dedicated pool |
| Webhook replay / duplicate | Idempotent handlers keyed on provider event id (`BillingEvent`) |
| Accidental bulk delete | Soft-delete (`Concern.deletedAt`), audit trail, retention-driven hard delete only |
| Cross-region residency breach | Region pinning on Network/Org; storage and DB selected by context |

## 7. What is genuinely new here (engineering)

1. `Network` model and Network-level reporting access.
2. `orgType` / `tenantType` discriminators and surface resolution.
3. Postgres RLS policies and the per-request GUC transaction wrapper.
4. Read-client / primary-client split in the data-access layer.
5. Partitioning on the high-volume tables.
6. Resource metering and per-tenant rate limiting.

Everything else (billing, entitlements, audit, retention, safeguarding, attendance, the worker runner) is reuse.
