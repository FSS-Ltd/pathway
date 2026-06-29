# 06 - Internal NexSteps Staff Billing and Cost-to-Serve

This is the explicit new requirement: a billing tracking element for NexSteps internal staff. It is separate from the customer-facing subscription billing already in the platform.

## 1. Scope (confirmed: full cost-to-serve)

This subsystem gives NexSteps/FSS internal visibility into the staff effort, cost, and margin of delivering and supporting CEE Connect: who spent time on what, what it cost, what it billed at, and whether each engagement and client stays above the FSS 40% margin floor.

Scope is confirmed as the **full cost-to-serve model**: internal staff time tracking, versioned rate cards (cost and bill rates), non-time expenses, apportioned infrastructure cost, optional professional-services invoicing, periodic margin rollups per engagement / school / network, and below-floor alerting. Every element specified in this document is in scope.

This is **not**:

- a change to how customers are charged. Customer subscriptions stay on Stripe/GoCardless via the existing `billing` module (`Subscription`, `OrgEntitlementSnapshot`, `UsageCounters`, `BillingEvent`, `PendingOrder`). This subsystem only reads that revenue data, by id, to compute margin.
- a customer-visible feature. No school, parent, or CEE user ever sees it.

## 2. Why it matters here

The FSS operating rules require escalation when "margin on a project has eroded below 40%". You cannot enforce that without measuring cost-to-serve. CEE is a low-budget, price-sensitive client (research: realistic central spend £10k to £50k/year; phased MVP £45k to £65k). On a thin engagement, a few unbilled support hours per month decide whether it is profitable. So margin tracking is not back-office nicety here; it is how the engagement is kept viable.

It also produces the numbers that the go/no-go gates in `deep-research-report.md` depend on: cost per school served, payback on the phased MVP, and whether to scale up or down.

## 3. Goals

1. Record internal staff time against engagements and clients.
2. Hold cost rates and bill rates per staff role, versioned over time.
3. Capture non-time costs (expenses, apportioned infrastructure).
4. Roll up revenue vs cost into a margin figure per engagement, per Org (school), and per Network (CEE).
5. Flag any engagement or client below the 40% margin floor.
6. Report utilisation per staff member and budget burn per engagement.

## 4. Placement and isolation

- Lives in the **Platform Admin** trust zone only, gated by `PLATFORM_FINANCE` (04.2). `PLATFORM_SUPPORT` cannot see it.
- Physically separated: a dedicated Prisma schema (`internal`) in the same Postgres instance, or a separate database via the connection resolver (02.3.2, 03.4). No `tenantId`, no RLS overlap with customer data, no path from any tenant or CEE role.
- Served by the new `platform-billing` API module (05.3) and the Platform Admin surface.
- All access is audited.

It references `Network` and `Org` by id only, for cost attribution. It never reads child or tenant operational data.

## 5. Data model (`internal` schema)

```prisma
enum EngagementType {
  IMPLEMENTATION     // build / rollout
  ONBOARDING         // per-school setup
  SUPPORT            // ongoing support / maintenance
  CUSTOM_DEV         // bespoke work
  ADVISORY           // strategy / discovery
}

enum EngagementStatus {
  PROSPECT
  ACTIVE
  PAUSED
  CLOSED
}

enum TimeEntryStatus {
  DRAFT
  SUBMITTED
  APPROVED
  REJECTED
}

model InternalStaff {
  id            String   @id @default(uuid())
  userId        String?  // optional link to platform User (superUser)
  name          String
  email         String   @unique
  roleTitle     String   // e.g. "Senior Engineer", "PM", "Support"
  isActive      Boolean  @default(true)
  defaultRateCardId String?
  defaultRateCard   RateCard? @relation(fields: [defaultRateCardId], references: [id])
  timeEntries   TimeEntry[]
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

// Versioned rates so historical cost is computed at the rate in force then.
model RateCard {
  id          String   @id @default(uuid())
  label       String   // e.g. "2026 Senior Engineer"
  roleTitle   String
  costRate    Decimal  @db.Decimal(10,2)  // internal cost per hour (£)
  billRate    Decimal  @db.Decimal(10,2)  // standard charge-out per hour (£)
  currency    String   @default("GBP")
  effectiveFrom DateTime
  effectiveTo   DateTime?
  staff       InternalStaff[]
  createdAt   DateTime @default(now())
  @@index([roleTitle, effectiveFrom])
}

model Engagement {
  id            String   @id @default(uuid())
  name          String   // e.g. "CEE rollout", "Maranatha onboarding", "TEACH pilot"
  type          EngagementType
  status        EngagementStatus @default(ACTIVE)
  networkId     String?  // CEE network, for attribution
  orgId         String?  // specific school / org, if scoped to one
  // commercial envelope
  budgetHours   Decimal? @db.Decimal(10,2)
  budgetAmount  Decimal? @db.Decimal(12,2)
  contractValue Decimal? @db.Decimal(12,2)  // fixed-fee / PS revenue, if any
  startsAt      DateTime
  endsAt        DateTime?
  timeEntries   TimeEntry[]
  expenses      InternalExpense[]
  invoices      EngagementInvoice[]
  marginSnapshots MarginSnapshot[]
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  @@index([networkId])
  @@index([orgId])
  @@index([status])
}

model TimeEntry {
  id            String   @id @default(uuid())
  staffId       String
  staff         InternalStaff @relation(fields: [staffId], references: [id])
  engagementId  String
  engagement    Engagement @relation(fields: [engagementId], references: [id])
  workDate      DateTime @db.Date
  minutes       Int
  activityType  String   // "dev" | "support" | "meeting" | "onboarding" | ...
  billable      Boolean  @default(true)
  // rate snapshots captured at submission, so later rate changes do not rewrite history
  costRate      Decimal  @db.Decimal(10,2)
  billRate      Decimal  @db.Decimal(10,2)
  note          String?
  status        TimeEntryStatus @default(DRAFT)
  approvedByStaffId String?
  approvedAt    DateTime?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  @@index([engagementId, workDate])         // partition candidate by workDate
  @@index([staffId, workDate])
  @@index([status])
}

model InternalExpense {
  id           String   @id @default(uuid())
  engagementId String
  engagement   Engagement @relation(fields: [engagementId], references: [id])
  category     String   // "infrastructure" | "third-party" | "travel" | ...
  description  String
  amount       Decimal  @db.Decimal(12,2)
  currency     String   @default("GBP")
  incurredOn   DateTime @db.Date
  createdAt    DateTime @default(now())
  @@index([engagementId, incurredOn])
}

enum InvoiceStatus {
  DRAFT
  SENT
  PAID
  VOID
}

// Optional: professional-services / fixed-fee invoices NexSteps raises to CEE,
// distinct from customer subscription billing. Patterned on Oasis `invoices`.
model EngagementInvoice {
  id           String   @id @default(uuid())
  engagementId String
  engagement   Engagement @relation(fields: [engagementId], references: [id])
  reference    String   @unique
  amount       Decimal  @db.Decimal(12,2)
  currency     String   @default("GBP")
  status       InvoiceStatus @default(DRAFT)
  issuedOn     DateTime? @db.Date
  dueOn        DateTime? @db.Date
  paidOn       DateTime? @db.Date
  lineItemsJson Json?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  @@index([engagementId, status])
}

// Periodic rollup (computed on apps/workers), the source of margin reporting and alerts.
model MarginSnapshot {
  id            String   @id @default(uuid())
  engagementId  String
  engagement    Engagement @relation(fields: [engagementId], references: [id])
  networkId     String?
  orgId         String?
  periodStart   DateTime @db.Date
  periodEnd     DateTime @db.Date
  // cost side
  billableHours Decimal  @db.Decimal(10,2)
  nonBillableHours Decimal @db.Decimal(10,2)
  laborCost     Decimal  @db.Decimal(12,2)   // sum(minutes/60 * costRate)
  expenseCost   Decimal  @db.Decimal(12,2)
  infraCostApportioned Decimal @db.Decimal(12,2)
  totalCost     Decimal  @db.Decimal(12,2)
  // revenue side
  subscriptionRevenue Decimal @db.Decimal(12,2) // from customer billing, attributed
  psRevenue     Decimal  @db.Decimal(12,2)       // from EngagementInvoice
  totalRevenue  Decimal  @db.Decimal(12,2)
  // result
  marginAmount  Decimal  @db.Decimal(12,2)
  marginPct     Decimal  @db.Decimal(6,2)
  belowFloor    Boolean  @default(false)         // marginPct < 40
  computedAt    DateTime @default(now())
  @@index([engagementId, periodEnd])
  @@index([networkId, periodEnd])
  @@index([belowFloor])
}
```

## 6. Revenue and cost reconciliation

Margin needs both sides. The cost side is internal; the revenue side is read (by id, read-only) from the existing customer billing.

**Cost side (this subsystem):**
- Labor cost = sum over approved `TimeEntry` of `(minutes / 60) * costRate`.
- Expense cost = sum of `InternalExpense.amount`.
- Apportioned infrastructure = a periodic allocation of shared platform infra cost (hosting, storage, third parties) across active engagements, by a documented key (for example, share of active tenants or active users). Recorded as an `infraCostApportioned` figure per snapshot.

**Revenue side (read from existing billing):**
- Subscription revenue: attributed from `Subscription` / `BillingEvent` for the Orgs linked to the engagement's `networkId` / `orgId`. For a Network engagement, sum the member schools' subscriptions (or the Network agreement value).
- Professional-services revenue: from `EngagementInvoice` (fixed-fee build, onboarding fees).

**Margin = totalRevenue − totalCost**, expressed as amount and percentage, snapshotted per period.

## 7. Flows

1. **Log time.** A NexSteps staff member records time against an engagement on the Platform Admin surface. Rate snapshots (`costRate`, `billRate`) are written at submission from the staff member's current `RateCard`, so later rate changes never rewrite history.
2. **Approve.** A lead approves submitted entries (`SUBMITTED → APPROVED`). Only approved entries count toward cost.
3. **Expenses and PS invoices.** Recorded against the engagement as incurred.
4. **Rollup.** A scheduled `apps/workers` job (nightly or weekly) computes `MarginSnapshot` per engagement, Org, and Network: it reads approved time, expenses, apportioned infra, and attributed revenue, and writes the snapshot.
5. **Alert.** Any snapshot with `marginPct < 40` sets `belowFloor = true` and raises an internal alert (email/Slack to the engagement lead), matching the FSS escalation rule.
6. **Report.** The Platform Admin surface shows margin per engagement and client, utilisation per staff, budget burn vs `budgetHours` / `budgetAmount`, and cost-to-serve per school.

## 8. Reporting outputs

- **Margin dashboard:** per engagement, per school (Org), per Network (CEE). Red flag below 40%.
- **Cost-to-serve per school:** total cost / number of schools served, the figure the research report's scale-up/scale-down gate needs.
- **Utilisation:** billable vs non-billable hours per staff member.
- **Budget burn:** hours and spend against the engagement envelope, with projected overrun.
- **Engagement P&L:** revenue, cost, margin over the engagement's life.

## 9. Integration points

- **Customer billing (`billing` module):** read-only, by Org/Network id, for the revenue side. No write coupling; the internal subsystem never changes customer billing.
- **Workers (`apps/workers`):** the margin rollup and the alert job.
- **Notifications (`mailer`):** below-floor alerts.
- **Auth (`packages/auth`):** `PLATFORM_FINANCE` gate.
- **Oasis `invoices`:** harvested as the pattern for `EngagementInvoice` and PS invoicing, if PS invoicing is wanted.

## 10. Failure modes

| Failure | Mitigation |
|---------|-----------|
| Rate change rewrites past cost | Rates snapshotted on each `TimeEntry`; rollups use snapshots |
| Unapproved time inflates cost | Only `APPROVED` entries count |
| Revenue double-counted across engagements | Attribution keyed on Org/Network; one Org maps to one revenue stream per period |
| Margin alert noise | Alert only on transition into `belowFloor`, not every snapshot |
| Internal data exposure | Separate schema/db, `PLATFORM_FINANCE` only, audited access |
| Infra apportionment disputes | Allocation key documented and stored on the snapshot for reproducibility |

## 11. Build scope

This subsystem is independent of the rest of the CEE vertical and can be built in parallel (it shares only the `Network` / `Org` ids and the workers runner). It is the smallest of the new pieces: roughly the `internal` schema, the `platform-billing` module, one Platform Admin screen set, and one worker job. It is sequenced in `07` as a parallel track so margin visibility exists from the start of the CEE engagement rather than being added after the fact.
