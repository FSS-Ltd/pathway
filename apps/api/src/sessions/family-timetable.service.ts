import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { prisma, withTenantRlsContext } from "@pathway/db";
import { recordAuditEventInTransaction } from "../audit/audit.service";
import { AuditAction, AuditEntityType } from "../audit/audit.types";
import type { FamilyTimetableRange } from "./dto/family-timetable-query.dto";

type FamilyTimetableScope =
  | { kind: "parent"; childId: string }
  | { kind: "student" };

@Injectable()
export class FamilyTimetableService {
  async list(
    siteId: string,
    userId: string,
    scope: FamilyTimetableScope,
    range: FamilyTimetableRange,
  ) {
    if (!siteId.trim() || !userId.trim()) {
      throw new BadRequestException("Site and authenticated user are required");
    }
    const site = await prisma.tenant.findUnique({
      where: { id: siteId },
      select: {
        orgId: true,
        timezone: true,
        org: { select: { parentPortalEnabled: true } },
      },
    });
    if (!site || (scope.kind === "parent" && !site.org.parentPortalEnabled)) {
      throw new NotFoundException("Timetable not found");
    }

    return withTenantRlsContext(siteId, site.orgId, async (tx) => {
      const now = new Date();
      let child: {
        id: string;
        groupId: string | null;
        firstName: string;
        preferredName: string | null;
      } | null = null;
      if (scope.kind === "parent") {
        const link = await tx.guardianChildRelationship.findFirst({
          where: {
            tenantId: siteId,
            childId: scope.childId,
            legalAccess: "FULL",
            startsAt: { lte: now },
            endedAt: null,
            revokedAt: null,
            guardianIdentity: { tenantId: siteId, userId },
            child: { tenantId: siteId, isGuest: false },
          },
          select: {
            child: {
              select: {
                id: true,
                groupId: true,
                firstName: true,
                preferredName: true,
              },
            },
          },
        });
        child = link?.child ?? null;
      } else {
        const [policy, links] = await Promise.all([
          tx.studentPortalPolicy.findUnique({
            where: { tenantId: siteId },
            select: { studentPortalEnabled: true },
          }),
          tx.studentIdentityLink.findMany({
            where: {
              tenantId: siteId,
              endedAt: null,
              revokedAt: null,
              linkedAt: { lte: now },
              studentIdentity: { tenantId: siteId, userId },
              child: { tenantId: siteId, isGuest: false },
            },
            select: {
              child: {
                select: {
                  id: true,
                  groupId: true,
                  firstName: true,
                  preferredName: true,
                },
              },
            },
            take: 2,
          }),
        ]);
        if (policy?.studentPortalEnabled && links.length === 1) {
          child = links[0].child;
        }
      }
      if (!child) throw new NotFoundException("Timetable not found");

      const items = child.groupId
        ? await tx.session.findMany({
            where: {
              tenantId: siteId,
              familyPublishedAt: { not: null },
              groups: { some: { id: child.groupId } },
              startsAt: { lt: range.to },
              endsAt: { gt: range.from },
            },
            select: {
              id: true,
              title: true,
              startsAt: true,
              endsAt: true,
            },
            orderBy: { startsAt: "asc" },
            take: 100,
          })
        : [];
      return {
        siteId,
        childId: child.id,
        childName: child.preferredName || child.firstName,
        timezone: site.timezone,
        from: range.from,
        to: range.to,
        items,
      };
    });
  }

  async setPublication(
    sessionId: string,
    siteId: string,
    orgId: string,
    actorUserId: string,
    publish: boolean,
  ) {
    return withTenantRlsContext(siteId, orgId, async (tx) => {
      const session = await tx.session.findFirst({
        where: { id: sessionId, tenantId: siteId },
        select: {
          id: true,
          familyPublishedAt: true,
          groups: { select: { id: true } },
        },
      });
      if (!session) throw new NotFoundException("Session not found");
      if (publish && session.groups.length === 0) {
        throw new BadRequestException("Assign a group before publishing");
      }
      if (Boolean(session.familyPublishedAt) === publish) {
        return { familyPublishedAt: session.familyPublishedAt };
      }
      const updated = await tx.session.update({
        where: { id: sessionId },
        data: { familyPublishedAt: publish ? new Date() : null },
        select: { familyPublishedAt: true },
      });
      await recordAuditEventInTransaction(tx, {
        tenantId: siteId,
        orgId,
        actorUserId,
        entityType: AuditEntityType.ACE_RECORD,
        entityId: sessionId,
        action: AuditAction.UPDATED,
        metadata: {
          recordType: "Session",
          event: publish ? "published" : "unpublished",
        },
      });
      return updated;
    });
  }
}
