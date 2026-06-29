# 03 - Domain Model

This document specifies the schema changes against the current Prisma model at
`packages/db/prisma/schema.prisma` (1,034 lines, reviewed in full). It lists only the deltas. Everything not mentioned is reused unchanged.

The guiding rule from the brief: TEACH must not be a school system with renamed labels. So the additions below give TEACH its own learning-centred entities (learner, learning log, subject, evidence, merit) rather than overloading school concepts.

## 1. New: Network and typing

```prisma
enum OrgType {
  SCHOOL
  TEACH_HOUSEHOLD
  CEE_CENTRAL
  PROGRAMME
  INTERNAL          // replaces the meaning of isMasterOrg; kept in sync for back-compat
}

enum TenantType {
  SCHOOL_SITE
  TEACH_HOUSEHOLD
  CENTRAL
  INTERNAL
}

model Network {
  id          String   @id @default(uuid())
  name        String                      // e.g. "Christian Education Europe"
  slug        String   @unique
  region      String?                     // residency pin, e.g. "uk-london"
  // optional network-level commercial agreement
  billingMode String   @default("PER_ORG") // PER_ORG | NETWORK | HYBRID
  orgs        Org[]
  reportingGrants NetworkReportingGrant[]
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

Changes to existing models:

```prisma
model Org {
  // ... existing fields ...
  orgType    OrgType  @default(SCHOOL)
  networkId  String?
  network    Network? @relation(fields: [networkId], references: [id])
  region     String?  // residency pin; inherits from Network if null
  // isMasterOrg stays; new code treats it as orgType == INTERNAL
  @@index([networkId])
  @@index([orgType])
}

model Tenant {
  // ... existing fields ...
  tenantType TenantType @default(SCHOOL_SITE)
  @@index([tenantType])
}
```

`NetworkReportingGrant` is defined in `04` (it is an access-control object, not a domain object).

## 2. New: TEACH learning entities

These are tenant-scoped (a TEACH household is a `Tenant`), carry `tenantId`, and are covered by RLS like every other tenant-owned table.

```prisma
model Subject {
  id        String   @id @default(uuid())
  tenantId  String
  tenant    Tenant   @relation(fields: [tenantId], references: [id])
  name      String                       // e.g. "Mathematics", "Scripture"
  category  String?                      // curriculum grouping
  color     String?
  isActive  Boolean  @default(true)
  sortOrder Int?
  learningLogs LearningLog[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@unique([tenantId, name])
  @@index([tenantId])
}

model LearningLog {
  id          String   @id @default(uuid())
  tenantId    String
  tenant      Tenant   @relation(fields: [tenantId], references: [id])
  childId     String                      // the learner
  child       Child    @relation(fields: [childId], references: [id])
  subjectId   String?
  subject     Subject? @relation(fields: [subjectId], references: [id])
  loggedByUserId String                   // parent-supervisor
  loggedBy    User     @relation(fields: [loggedByUserId], references: [id])
  activityDate DateTime @db.Date
  minutes     Int?                        // time on activity
  title       String
  description String?  @db.Text
  evidence    Evidence[]
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  @@index([tenantId, activityDate])       // partition key candidate (02)
  @@index([tenantId, childId, activityDate])
  @@index([subjectId])
}

model Evidence {
  id            String   @id @default(uuid())
  tenantId      String
  tenant        Tenant   @relation(fields: [tenantId], references: [id])
  childId       String
  child         Child    @relation(fields: [childId], references: [id])
  learningLogId String?
  learningLog   LearningLog? @relation(fields: [learningLogId], references: [id])
  title         String
  storageKey    String                    // object storage, signed-URL access (02.4.5)
  mimeType      String
  byteSize      Int
  capturedAt    DateTime?
  uploadedByUserId String
  uploadedBy    User    @relation(fields: [uploadedByUserId], references: [id])
  createdAt     DateTime @default(now())
  @@index([tenantId, childId])
  @@index([learningLogId])
}

enum MeritType {
  MERIT
  ACHIEVEMENT
  MILESTONE
}

model Merit {
  id          String   @id @default(uuid())
  tenantId    String
  tenant      Tenant   @relation(fields: [tenantId], references: [id])
  childId     String
  child       Child    @relation(fields: [childId], references: [id])
  type        MeritType @default(MERIT)
  reason      String
  points      Int      @default(1)
  awardedByUserId String
  awardedBy   User     @relation(fields: [awardedByUserId], references: [id])
  awardedAt   DateTime @default(now())
  @@index([tenantId, childId])
}

enum ReportBundleStatus {
  PENDING
  GENERATING
  READY
  FAILED
}

model ReportBundle {
  id          String   @id @default(uuid())
  tenantId    String
  tenant      Tenant   @relation(fields: [tenantId], references: [id])
  childId     String?
  requestedByUserId String
  requestedBy User     @relation(fields: [requestedByUserId], references: [id])
  periodStart DateTime @db.Date
  periodEnd   DateTime @db.Date
  status      ReportBundleStatus @default(PENDING)
  storageKey  String?                     // generated PDF/zip in object storage
  downloadTokenId String?                 // reuse existing DownloadToken model
  createdAt   DateTime @default(now())
  completedAt DateTime?
  @@index([tenantId, childId])
  @@index([status])
}
```

Generation of `ReportBundle` runs on `apps/workers` (02.4.4), not inline, and the download is gated by the existing `DownloadToken` mechanism.

## 3. Reused for Family Hub (no new tables)

Family Hub is a visibility surface. It needs almost no new schema because the publish/approve machinery already exists:

- `ChildNote.visibleToParents` + `approvedByUserId` / `approvedAt` already gate which notes parents see.
- `Announcement.audience` (`ALL | PARENTS | STAFF`) already targets parents.
- `Child.photoConsent`, `ParentSignupConsent`, and the recent "separate child profile pictures from media consent" work already model consent.
- Parent ↔ child links exist via `ParentChildren` and `ChildGuardianContact`.

The only addition is an explicit per-item publishing decision for documents, so a school controls exactly which `Lesson`/`Evidence`/`ReportBundle` items surface in Family Hub:

```prisma
enum PublishTarget {
  FAMILY_HUB
}

model PublishedItem {
  id          String   @id @default(uuid())
  tenantId    String
  tenant      Tenant   @relation(fields: [tenantId], references: [id])
  childId     String?                     // null = whole-group / whole-site item
  target      PublishTarget @default(FAMILY_HUB)
  entityType  String                      // "ChildNote" | "Lesson" | "ReportBundle" | "Announcement"
  entityId    String
  publishedByUserId String
  publishedAt DateTime @default(now())
  unpublishedAt DateTime?
  @@unique([tenantId, target, entityType, entityId])
  @@index([tenantId, childId, target])
}
```

This keeps "what a parent can see" as one queryable, auditable place rather than a scatter of boolean flags.

## 4. Internal staff billing tables

These live in a **separate namespace** and are specified in full in `06`. They are platform-scoped (no `tenantId`, never reachable by tenant or CEE users) and reference `Network` / `Org` only by id for cost attribution. They are listed here only so the full picture is in one place: `InternalStaff`, `RateCard`, `Engagement`, `TimeEntry`, `InternalExpense`, `EngagementInvoice`, `MarginSnapshot`.

Recommended physical separation: a dedicated Prisma schema (`internal`) in the same Postgres instance, or a separate database reached through the connection resolver (02.3.2). Either keeps RLS and access surfaces clean.

## 5. Audit coverage widening

The current `AuditEntityType` enum only covers `CONCERN` and `CHILD_NOTE`. For a system holding children's records under DPA, audit has to cover every sensitive read and write. Widen it:

```prisma
enum AuditEntityType {
  CONCERN
  CHILD_NOTE
  CHILD
  LEARNING_LOG
  EVIDENCE
  REPORT_BUNDLE
  DOCUMENT
  GUARDIAN_LINK
  EXPORT
  CENTRAL_ACCESS_GRANT
  BILLING
}
```

`AuditAction` already includes `VIEWED`, which is what makes "audit every sensitive record view" (brief 7.2) achievable.

## 6. Migration strategy

The deltas are additive, which keeps migration low-risk.

1. **Phase A (additive, no behaviour change):** add `Network`, `OrgType`, `TenantType`, the `orgType` / `tenantType` / `networkId` columns with safe defaults, and the new TEACH tables. Backfill existing orgs to `orgType = SCHOOL` (or `INTERNAL` where `isMasterOrg = true`) and existing tenants to `SCHOOL_SITE`. No reads change yet.
2. **Phase B (RLS):** enable RLS table-by-table behind a flag, starting with a single low-risk table in staging, with the GUC transaction wrapper in place. Validate that every existing endpoint still returns correct rows. RLS is enabled per environment only after the wrapper is proven.
3. **Phase C (binary off-load):** migrate inline `Bytes` columns (`photoBytes`, `avatarBytes`, `resourceFileBytes`) to object storage; keep the columns as nullable fallback until backfill completes, then drop.
4. **Phase D (partitioning):** convert `Attendance`, `AuditEvent`, `StaffActivity`, `LearningLog`, `BillingEvent` to partitioned tables. Done as an online migration with a backfill window.
5. **Phase E (internal billing):** create the `internal` schema/db and its tables. Independent of A to D.

Each phase ships behind its own migration and is reversible: Phase A and E are drop-column / drop-table reversible; Phase B is a policy disable; Phase C keeps the fallback column until proven; Phase D is the only one needing a planned window.

## 7. Naming for surfaces

Same tables, surface-appropriate labels in the UI layer (not the schema):

| Schema term | School UI | TEACH UI |
|-------------|-----------|----------|
| `Child` | pupil / child | learner |
| `Group` | class | (optional) group |
| `Session` | session / register | learning session / activity |
| `ChildNote` | note | progress note |
| `Attendance` | register | learning log attendance |
| `Lesson` | lesson | resource |

The label mapping lives in `packages/ui` and the surface config, so one data model serves both audiences without forking.
