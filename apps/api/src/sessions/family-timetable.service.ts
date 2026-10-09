import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { withTenantRlsContext } from "@pathway/db";
import { recordAuditEventInTransaction } from "../audit/audit.service";
import { AuditAction, AuditEntityType } from "../audit/audit.types";
import type { FamilyTimetableRange } from "./dto/family-timetable-query.dto";
import {
  requireFamilyTimetableChild,
  requireFamilyTimetableSite,
  type FamilyTimetableScope,
} from "./family-timetable-access";

@Injectable()
export class FamilyTimetableService {
  async list(
    siteId: string,
    userId: string,
    scope: FamilyTimetableScope,
    range: FamilyTimetableRange,
  ) {
    const site = await requireFamilyTimetableSite(siteId, userId, scope);

    return withTenantRlsContext(siteId, site.orgId, async (tx) => {
      const child = await requireFamilyTimetableChild(
        tx,
        siteId,
        userId,
        scope,
      );

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
