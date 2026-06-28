# Diagram source - Tenancy hierarchy and product surfaces

Rendered references appear in `01-architecture-overview.md` and `02-multi-tenancy-and-scalability.md`. Source kept here as Mermaid for editing.

## Tenancy hierarchy

```mermaid
flowchart TD
  NET["Network: CEE\n(oversight, optional network billing)"]
  subgraph Schools
    O1["Org: School A\norgType=SCHOOL\n(billing boundary)"]
    O2["Org: School B\norgType=SCHOOL"]
    S1["Site A1\nTenant (RLS boundary)"]
    S2["Site A2\nTenant"]
    S3["Site B1\nTenant"]
  end
  subgraph TEACH
    OT["Org(s): TEACH households\norgType=TEACH_HOUSEHOLD"]
    ST["Household Sites\nTenant"]
  end
  OC["Org: CEE Central\norgType=CEE_CENTRAL\n(aggregate access)"]
  OI["Org: NexSteps Internal\norgType=INTERNAL\n(non-billable)"]

  NET --> O1 --> S1
  O1 --> S2
  NET --> O2 --> S3
  NET --> OT --> ST
  NET --> OC
  OI -. platform admin .- NET
```

## Surface resolution and access modes

```mermaid
flowchart LR
  REQ[Request] --> AUTH[Authenticate\nAuth0 -> User via UserIdentity]
  AUTH --> MEM[Resolve memberships\nOrg/Site/Network/Platform roles]
  MEM --> MODE{Access mode}
  MODE -->|platform| P[Platform Admin\ninternal billing, provisioning]
  MODE -->|aggregate| C[CEE Central\naggregate views only]
  MODE -->|tenant| T[Tenant app\nschools / family / teach]
  P --> TX[DB tx: SET LOCAL GUCs\ncurrent_org / current_tenant / access_mode]
  C --> TX
  T --> TX
  TX --> POL[Policy/ABAC authorizes action]
  POL --> H[Handler runs; sensitive ops audited]
```

## Internal staff billing isolation

```mermaid
flowchart TD
  subgraph Customer["Customer data (RLS, tenant-scoped)"]
    SUB[Subscription / BillingEvent]
    TEN[Tenants, Children, etc.]
  end
  subgraph Internal["internal schema (Platform Admin only, PLATFORM_FINANCE)"]
    ENG[Engagement]
    TE[TimeEntry]
    RC[RateCard]
    EXP[InternalExpense]
    INV[EngagementInvoice]
    MS[MarginSnapshot]
  end
  TE --> MS
  EXP --> MS
  INV --> MS
  SUB -.read-only, by Org/Network id.-> MS
  MS -->|marginPct < 40| ALERT[Escalation alert]
```
