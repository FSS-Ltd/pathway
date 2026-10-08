import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, withTenantRlsContext } from "@pathway/db";
import { AuditAction, AuditEntityType } from "../audit/audit.types";
import { recordAuditEventInTransaction } from "../audit/audit.service";

export type GuardianReviewBasis = "SCHOOL_RECORDS" | "LEGAL_DOCUMENT";

@Injectable()
export class GuardianAccessReviewService {
  async list(tenantId: string, orgId: string, parentId: string) {
    return withTenantRlsContext(tenantId, orgId, async (tx) => {
      const parent = await tx.user.findFirst({
        where: {
          id: parentId,
          isActive: true,
          hasFamilyAccess: true,
          children: { some: { tenantId, tenant: { orgId } } },
        },
        select: {
          id: true,
          firstLoginAt: true,
          identities: { select: { id: true }, take: 1 },
          children: {
            where: { tenantId, tenant: { orgId } },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              isGuest: true,
            },
            orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
          },
        },
      });
      if (!parent) throw new NotFoundException("Parent not found");

      const [site, guardian] = await Promise.all([
        tx.tenant.findFirst({
          where: { id: tenantId, orgId },
          select: { org: { select: { parentPortalEnabled: true } } },
        }),
        tx.guardianIdentity.findUnique({
          where: { tenantId_userId: { tenantId, userId: parentId } },
          select: {
            relationships: {
              where: {
                tenantId,
                legalAccess: "FULL",
                startsAt: { lte: new Date() },
                endedAt: null,
                revokedAt: null,
              },
              select: { childId: true },
            },
          },
        }),
      ]);
      if (!site) throw new NotFoundException("Site not found");
      const approved = new Set(
        guardian?.relationships.map((relationship) => relationship.childId) ??
          [],
      );

      return {
        parentId,
        hasVerifiedSignIn:
          parent.firstLoginAt !== null && parent.identities.length > 0,
        parentPortalEnabled: site.org.parentPortalEnabled,
        children: parent.children.map((child) => ({
          id: child.id,
          fullName: `${child.firstName} ${child.lastName}`.trim(),
          isGuest: child.isGuest,
          hasFullAccess: approved.has(child.id),
        })),
      };
    });
  }

  async approve(
    tenantId: string,
    orgId: string,
    actorUserId: string,
    parentId: string,
    childId: string,
    reviewBasis: GuardianReviewBasis,
  ) {
    return withTenantRlsContext(tenantId, orgId, async (tx) => {
      const lockKey = `guardian-access-review:${tenantId}:${parentId}:${childId}`;
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`,
      );
      const [site, parent, child, studentIdentity] = await Promise.all([
        tx.tenant.findFirst({
          where: { id: tenantId, orgId },
          select: { id: true },
        }),
        tx.user.findFirst({
          where: { id: parentId, isActive: true, hasFamilyAccess: true },
          select: {
            id: true,
            firstLoginAt: true,
            identities: { select: { id: true }, take: 1 },
          },
        }),
        tx.child.findFirst({
          where: {
            id: childId,
            tenantId,
            tenant: { orgId },
            isGuest: false,
            guardians: { some: { id: parentId } },
          },
          select: { id: true },
        }),
        tx.studentIdentity.findUnique({
          where: { tenantId_userId: { tenantId, userId: parentId } },
          select: { id: true },
        }),
      ]);
      if (!site || !parent || !child || studentIdentity) {
        throw new NotFoundException("Parent-child link not found");
      }
      if (!parent.firstLoginAt || parent.identities.length === 0) {
        throw new ConflictException("Parent must sign in before access review");
      }

      const guardian = await tx.guardianIdentity.upsert({
        where: { tenantId_userId: { tenantId, userId: parentId } },
        create: { tenantId, userId: parentId },
        update: {},
        select: { id: true },
      });
      const existing = await tx.guardianChildRelationship.findFirst({
        where: {
          tenantId,
          guardianIdentityId: guardian.id,
          childId,
          legalAccess: "FULL",
          startsAt: { lte: new Date() },
          endedAt: null,
          revokedAt: null,
        },
        select: { id: true },
      });
      if (existing) return { id: existing.id, childId, created: false };

      const relationship = await tx.guardianChildRelationship.create({
        data: {
          tenantId,
          guardianIdentityId: guardian.id,
          childId,
          legalAccess: "FULL",
        },
        select: { id: true },
      });
      await tx.userTenantRole.upsert({
        where: {
          userId_tenantId_role: { userId: parentId, tenantId, role: "PARENT" },
        },
        create: { userId: parentId, tenantId, role: "PARENT" },
        update: {},
      });
      await recordAuditEventInTransaction(tx, {
        actorUserId,
        tenantId,
        orgId,
        entityType: AuditEntityType.ACE_RECORD,
        entityId: relationship.id,
        action: AuditAction.CREATED,
        metadata: {
          kind: "GUARDIAN_ACCESS_REVIEW",
          parentUserId: parentId,
          childId,
          legalAccess: "FULL",
          reviewBasis,
          source: "EXISTING_PARENT_CHILD_LINK",
        },
      });
      return { id: relationship.id, childId, created: true };
    });
  }
}
