# 04 - RBAC, Trust Zones, and Compliance

This document covers who can see what, how the boundaries are enforced, and how the platform meets UK data-protection expectations for children's data. It builds on the existing role models (`Role`, `OrgRole`, `SiteRole`, `UserOrgRole`, `UserTenantRole`, `OrgMembership`, `SiteMembership`) rather than replacing them.

## 1. Trust zones

Four zones, in increasing privilege. Access never widens implicitly between them.

```
[Public]            marketing, lead capture, public docs, public pricing
                    no authenticated data

[Tenant apps]       CEE Connect for Schools, Family Hub, TEACH Hub
                    scoped to one tenant (Site) by RLS + guards

[CEE Central]       aggregate oversight across the Network
                    aggregate-only by default; child-level only by explicit grant

[Platform Admin]    NexSteps / FSS internal
                    tenant provisioning, support, internal staff billing (06)
```

Hard rule from the brief (6.4): CEE Central does not automatically see child-level records across schools. The legal basis, the school agreement, and an explicit permission have to exist first. That rule is encoded, not just documented (section 4 below).

## 2. Role model per zone

Reusing the existing enums and adding only what the new zones need.

### Platform / FSS (Platform Admin zone)

- Platform Owner, Platform Support, Billing/Finance Admin.
- Implemented via `User.superUser = true` plus membership of an `INTERNAL` org. New code reads a `PlatformRole` (added) rather than the bare boolean, so support and finance can be separated (a support engineer should not see margin data; a finance admin should).

```prisma
enum PlatformRole {
  PLATFORM_OWNER
  PLATFORM_SUPPORT
  PLATFORM_FINANCE     // internal billing / margin (06)
}
```

### CEE Central zone

- CEE Owner/Admin, CEE Programme Manager, CEE Reporting Viewer, CEE Support/Onboarding.
- Implemented as `UserOrgRole` on the `CEE_CENTRAL` org plus Network-level reporting grants. CEE roles map to aggregate read access by default.

### School tenant zone (existing `Role` / `SiteRole`)

- School Admin (`SITE_ADMIN`), Leader, Teacher, Support staff, Safeguarding/Pastoral lead, Read-only viewer (`VIEWER`).
- The one addition: separate the safeguarding/pastoral permission from general staff, so `Concern` access is not implied by being a teacher (brief 7.2). This is a permission flag, not a new role, to avoid role sprawl.

### Family Hub zone

- Parent/Guardian, Secondary Guardian, Invited family member (optional).
- Implemented via `ParentChildren` / `ChildGuardianContact` links. A guardian sees only their own linked children, and only published items (`PublishedItem`, see `03`).

### TEACH Hub zone

- Parent Supervisor, Co-parent/Guardian, Tutor/Mentor (optional), Learner view (optional, later).
- The parent is the supervisor and the primary writer, which is the workflow difference from the school side.

## 3. Authorization model: roles for UI, policies for decisions

Role sprawl is the failure mode the brief warns against (7.2). The design uses a small number of roles for the UI and a policy layer (ABAC) for actual decisions.

A decision is `can(actor, action, resource)` evaluated against:

- the actor's memberships and roles (org, site, network, platform);
- the resource's `tenantId` / `orgId` / `networkId`;
- the access mode (`tenant | aggregate | platform`) set on the request (02.3.1);
- resource sensitivity (ordinary note vs `Concern` vs medical).

This lives in `packages/auth` as a policy module, called by NestJS guards. The same policy that returns the 403 also drives what the UI renders, so the screen and the API never disagree.

Principles (brief 7.2):

- Least privilege by default.
- Child data visible only where a valid relationship and permission exist.
- Central users see aggregate by default; child-level is an explicit grant.
- Every sensitive view, edit, and export is audited (`AuditAction.VIEWED` already exists).
- Operational permissions are separate from safeguarding/pastoral permissions.

## 4. CEE Central access: aggregate by default, granted child-access by exception

This is the most sensitive design point, so it is mechanised.

```prisma
enum ReportingScope {
  AGGREGATE          // counts, rates, no child rows
  CHILD_LEVEL        // named child records, time-boxed, logged
}

model NetworkReportingGrant {
  id          String   @id @default(uuid())
  networkId   String
  network     Network  @relation(fields: [networkId], references: [id])
  orgId       String                       // the school the grant applies to
  scope       ReportingScope @default(AGGREGATE)
  grantedByUserId String                   // a school admin must grant child-level
  legalBasis  String                       // recorded reason / agreement reference
  startsAt    DateTime
  expiresAt   DateTime?
  revokedAt   DateTime?
  createdAt   DateTime @default(now())
  @@index([networkId, orgId])
}
```

Enforcement:

- CEE Central requests run with `access_mode = 'aggregate'`. RLS and the policy layer expose only aggregate reporting views (counts of pupils, active users, attendance rates, onboarding status), never raw `Child` rows.
- A `CHILD_LEVEL` grant is created only by a **school** admin (the data controller for that school), with a recorded `legalBasis` and an expiry. Only then can a named CEE user, for that school, see child-level data, and every such view writes an `AuditEvent` with `entityType = CENTRAL_ACCESS_GRANT`.
- No grant, no rows. Default deny.

This directly answers brief risk 3 ("CEE Central creates data protection issues") and decision D6.

## 5. Data controller / processor model

- Each **school** is the data controller for its pupils. FSS/NexSteps is the data processor. A per-tenant Data Processing Agreement is required at onboarding.
- **CEE** is a controller for TEACH families it directly serves, and a recipient (under agreement) of aggregate data from schools. CEE is not, by default, a controller of individual schools' pupil data.
- The model is recorded per Org so exports, DSARs, and breach notifications route to the right controller.

## 6. GDPR / UK DPA implementation (reusing what exists)

The platform already carries the machinery; the CEE vertical configures and extends it.

| Requirement | Existing mechanism | CEE addition |
|-------------|--------------------|--------------|
| Role-based access | `UserTenantRole`, `SiteRole`, guards | RLS + policy layer (above) |
| Audit logs | `AuditEvent` | wider `AuditEntityType` (03.5), view auditing |
| Retention rules | `OrgRetentionPolicy` (attendance/staff/audit days) | per-`orgType` defaults; TEACH and learning-log retention |
| Secure deletion | `OrgDeletedUser`, soft-delete, retention jobs | partition drop for time-series (02.4.2) |
| DSAR / export readiness | `dsar`, `exports`, `DownloadToken` | per-child export bundle (`ReportBundle`) |
| Consent | `ParentSignupConsent`, `Child.photoConsent` | per-item publishing consent (`PublishedItem`) |
| Encryption in transit/at rest | TLS, managed Postgres, storage encryption | enforced in infra (07.3) |
| Data minimisation | per-surface field exposure | TEACH/Family Hub see only what they need |
| Incident response | - | documented runbook (07) |

## 7. Sensitive records get stronger handling

`Concern` (safeguarding) and medical notes are treated differently from ordinary notes (brief 10.2):

- Narrower role access (safeguarding/pastoral permission, not general staff).
- Stronger audit, including `VIEWED`.
- Optional sealed/private notes (a `Concern` visibility flag) for the most sensitive cases.
- Export controls: sensitive records are excluded from routine exports unless explicitly included by an authorised role.
- Retention labels and access-review capability.

## 8. Internal staff billing isolation

The internal staff billing data (06) is in the Platform Admin zone only, gated by `PLATFORM_FINANCE`. It is physically separated (separate Prisma schema or database, 03.4). No tenant role, no CEE role, and no `PLATFORM_SUPPORT` role can read margin or cost data. Access to it is itself audited.

## 9. Summary of additions

- `PlatformRole` enum and a real Platform Admin role split.
- A policy (ABAC) module in `packages/auth` driving both guards and UI.
- `NetworkReportingGrant` + `ReportingScope` for default-deny CEE Central access.
- A safeguarding/pastoral permission flag separate from staff roles.
- Wider audit coverage (03.5).
- Documented controller/processor model per Org.

Everything else is the existing RBAC, retention, DSAR, and audit machinery, configured for the CEE vertical.
