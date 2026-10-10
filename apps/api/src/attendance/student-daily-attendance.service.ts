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
export class StudentDailyAttendanceService {
  async list(
    siteId: string,
    query: FamilyDailyAttendanceQuery,
    userId: string,
  ): Promise<FamilyDailyAttendanceHistory> {
    if (!siteId.trim() || !userId.trim()) {
      throw new BadRequestException(
        "A site and authenticated user are required",
      );
    }
    const site = await prisma.tenant.findUnique({
      where: { id: siteId },
      select: { orgId: true, timezone: true },
    });
    if (!site) throw new NotFoundException("Daily attendance not found");

    return withTenantRlsContext(siteId, site.orgId, async (tx) => {
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
            linkedAt: { lte: new Date() },
            studentIdentity: {
              tenantId: siteId,
              userId,
              user: { isActive: true },
            },
            child: { tenantId: siteId, isGuest: false },
          },
          select: { childId: true },
          take: 2,
        }),
      ]);
      if (!policy?.studentPortalEnabled || links.length !== 1) {
        throw new NotFoundException("Daily attendance not found");
      }
      return readFamilyDailyAttendanceHistory(
        tx,
        siteId,
        links[0].childId,
        site.timezone,
        query,
      );
    });
  }
}
