import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { prisma, withTenantRlsContext } from "@pathway/db";
import type { FamilyDailyAttendanceQuery } from "./dto/family-daily-attendance-query.dto";
import {
  readFamilyDailyAttendanceHistory,
  type FamilyDailyAttendanceHistory,
} from "./family-daily-attendance-history";

@Injectable()
export class ParentDailyAttendanceService {
  async list(
    siteId: string,
    childId: string,
    query: FamilyDailyAttendanceQuery,
    userId: string,
  ): Promise<FamilyDailyAttendanceHistory> {
    if (!siteId.trim() || !childId.trim() || !userId.trim()) {
      throw new BadRequestException(
        "A site, child and authenticated user are required",
      );
    }
    const site = await prisma.tenant.findUnique({
      where: { id: siteId },
      select: {
        orgId: true,
        timezone: true,
        org: { select: { parentPortalEnabled: true } },
      },
    });
    if (!site?.org.parentPortalEnabled) {
      throw new NotFoundException("Daily attendance not found");
    }

    return withTenantRlsContext(siteId, site.orgId, async (tx) => {
      const relationship = await tx.guardianChildRelationship.findFirst({
        where: {
          tenantId: siteId,
          childId,
          legalAccess: "FULL",
          startsAt: { lte: new Date() },
          endedAt: null,
          revokedAt: null,
          guardianIdentity: {
            tenantId: siteId,
            userId,
            user: { isActive: true },
          },
          child: { tenantId: siteId, isGuest: false },
        },
        select: { id: true },
      });
      if (!relationship) {
        throw new NotFoundException("Daily attendance not found");
      }
      return readFamilyDailyAttendanceHistory(
        tx,
        siteId,
        childId,
        site.timezone,
        query,
      );
    });
  }
}
