import { Injectable, NotFoundException } from "@nestjs/common";
import { withTenantRlsContext } from "@pathway/db";
import {
  requireFamilyTimetableChild,
  requireFamilyTimetableSite,
  type FamilyTimetableScope,
} from "./family-timetable-access";

@Injectable()
export class FamilySubjectTimetableService {
  async list(siteId: string, userId: string, scope: FamilyTimetableScope) {
    const site = await requireFamilyTimetableSite(siteId, userId, scope);
    return withTenantRlsContext(siteId, site.orgId, async (tx) => {
      const child = await requireFamilyTimetableChild(
        tx,
        siteId,
        userId,
        scope,
      );
      const periods = await tx.academicPeriod.findMany({
        where: {
          tenantId: siteId,
          aceStudentTimetablePublications: {
            some: {
              tenantId: siteId,
              childId: child.id,
              publishedAt: { not: null },
            },
          },
        },
        orderBy: { startsOn: "desc" },
        take: 30,
        select: {
          id: true,
          aceStudentTimetablePublications: {
            where: {
              tenantId: siteId,
              childId: child.id,
              publishedAt: { not: null },
            },
            orderBy: [{ draftVersion: "desc" }, { id: "desc" }],
            take: 1,
            select: {
              id: true,
              periodName: true,
              periodStartsOn: true,
              periodEndsOn: true,
              publishedAt: true,
              withdrawnAt: true,
            },
          },
        },
      });
      return {
        siteId,
        childId: child.id,
        childName: child.preferredName || child.firstName,
        items: periods.flatMap((period) => {
          const latest = period.aceStudentTimetablePublications[0];
          return latest?.publishedAt && !latest.withdrawnAt
            ? [
                {
                  periodId: period.id,
                  publicationId: latest.id,
                  periodName: latest.periodName,
                  periodStartsOn: latest.periodStartsOn,
                  periodEndsOn: latest.periodEndsOn,
                  publishedAt: latest.publishedAt,
                },
              ]
            : [];
        }),
      };
    });
  }

  async get(
    siteId: string,
    userId: string,
    scope: FamilyTimetableScope,
    periodId: string,
  ) {
    const site = await requireFamilyTimetableSite(siteId, userId, scope);
    return withTenantRlsContext(siteId, site.orgId, async (tx) => {
      const child = await requireFamilyTimetableChild(
        tx,
        siteId,
        userId,
        scope,
      );
      const latest = await tx.aceStudentTimetablePublication.findFirst({
        where: {
          tenantId: siteId,
          childId: child.id,
          academicPeriodId: periodId,
          publishedAt: { not: null },
        },
        orderBy: [{ draftVersion: "desc" }, { id: "desc" }],
        select: {
          id: true,
          academicPeriodId: true,
          periodName: true,
          periodStartsOn: true,
          periodEndsOn: true,
          yearBandName: true,
          publishedAt: true,
          withdrawnAt: true,
          entries: {
            orderBy: [{ day: "asc" }, { slotPosition: "asc" }],
            select: {
              day: true,
              slotPosition: true,
              slotKind: true,
              slotLabel: true,
              startMinutes: true,
              endMinutes: true,
              subjectName: true,
              subjectColor: true,
            },
          },
        },
      });
      if (!latest?.publishedAt || latest.withdrawnAt) {
        throw new NotFoundException("Timetable not found");
      }
      return {
        siteId,
        childId: child.id,
        childName: child.preferredName || child.firstName,
        timezone: site.timezone,
        publicationId: latest.id,
        periodId: latest.academicPeriodId,
        periodName: latest.periodName,
        periodStartsOn: latest.periodStartsOn,
        periodEndsOn: latest.periodEndsOn,
        yearBandName: latest.yearBandName,
        publishedAt: latest.publishedAt,
        entries: latest.entries,
      };
    });
  }
}
