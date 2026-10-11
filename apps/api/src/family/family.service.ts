import { Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { prisma, withTenantRlsContext } from "@pathway/db";
import { AceNoticeParentInboxService } from "../ace-notices/ace-notice-parent-inbox.service";
import { ParentDailyAttendanceService } from "../attendance/parent-daily-attendance.service";
import {
  localDate,
  type FamilyDailyAttendanceHistory,
} from "../attendance/family-daily-attendance-history";
import { ParentMessagingService } from "../messaging/parent-messaging.service";
import {
  isFamilySectionEnabled,
  UNAVAILABLE_FAMILY_SECTIONS,
  type FamilySectionResult,
} from "./family-release-policy";

type NoticeSummary = { items: Array<{ id: string; title: string }> };
type MessageSummary = { unreadCount: number };

export interface FamilySummary {
  siteId: string;
  childId: string;
  childName: string;
  asOf: Date;
  sections: {
    attendance: FamilySectionResult<FamilyDailyAttendanceHistory>;
    notices: FamilySectionResult<NoticeSummary>;
    messages: FamilySectionResult<MessageSummary>;
  } & typeof UNAVAILABLE_FAMILY_SECTIONS;
}

@Injectable()
export class FamilyService {
  private readonly logger = new Logger(FamilyService.name);

  constructor(
    @Inject(ParentDailyAttendanceService)
    private readonly attendance: ParentDailyAttendanceService,
    @Inject(AceNoticeParentInboxService)
    private readonly notices: AceNoticeParentInboxService,
    @Inject(ParentMessagingService)
    private readonly messages: ParentMessagingService,
  ) {}

  async summary(
    siteId: string,
    childId: string,
    userId: string,
  ): Promise<FamilySummary> {
    const site = await prisma.tenant.findUnique({
      where: { id: siteId },
      select: {
        orgId: true,
        timezone: true,
        org: {
          select: {
            parentPortalEnabled: true,
            orgVertical: { select: { vertical: true } },
          },
        },
      },
    });
    if (
      !site?.org.parentPortalEnabled ||
      site.org.orgVertical?.vertical !== "ACE_SCHOOL"
    ) {
      throw new NotFoundException("Family summary not found");
    }
    const asOf = new Date();
    const schoolDay = localDate(asOf, site.timezone ?? "");
    if (!schoolDay) throw new NotFoundException("Family summary not found");
    const childName = await this.requireCurrentChild(
      siteId,
      site.orgId,
      childId,
      userId,
      schoolDay,
      asOf,
    );
    const from = new Date(
      Date.parse(`${schoolDay}T00:00:00.000Z`) - 29 * 86_400_000,
    )
      .toISOString()
      .slice(0, 10);
    const [attendance, notices, messages] = await Promise.all([
      this.loadSection("attendance", () =>
        this.attendance.list(siteId, childId, { from, to: schoolDay }, userId),
      ),
      this.loadSection("notices", () =>
        this.notices.list(siteId, userId, { limit: 3 }).then((page) => ({
          items: page.items.map(({ id, title }) => ({ id, title })),
        })),
      ),
      this.loadSection("messages", () =>
        this.messages.list(siteId, userId).then((page) => ({
          unreadCount: page.items.reduce(
            (total, item) => total + item.unreadCount,
            0,
          ),
        })),
      ),
    ]);
    const checkedAt = new Date();
    const currentSchoolDay = localDate(checkedAt, site.timezone ?? "");
    if (!currentSchoolDay)
      throw new NotFoundException("Family summary not found");
    await this.requireCurrentChild(
      siteId,
      site.orgId,
      childId,
      userId,
      currentSchoolDay,
      checkedAt,
    );
    return {
      siteId,
      childId,
      childName,
      asOf,
      sections: {
        attendance,
        notices,
        messages,
        ...UNAVAILABLE_FAMILY_SECTIONS,
      },
    };
  }

  private async requireCurrentChild(
    siteId: string,
    orgId: string,
    childId: string,
    userId: string,
    schoolDay: string,
    now: Date,
  ): Promise<string> {
    const date = new Date(`${schoolDay}T00:00:00.000Z`);
    return withTenantRlsContext(siteId, orgId, async (tx) => {
      const [relationship, enrollment, student, permission] = await Promise.all(
        [
          tx.guardianChildRelationship.findFirst({
            where: {
              tenantId: siteId,
              childId,
              legalAccess: "FULL",
              startsAt: { lte: now },
              endedAt: null,
              revokedAt: null,
              guardianIdentity: {
                tenantId: siteId,
                userId,
                user: { isActive: true },
              },
              child: { tenantId: siteId, isGuest: false },
            },
            select: {
              child: { select: { firstName: true, lastName: true } },
            },
          }),
          tx.aceSchoolEnrollment.findFirst({
            where: {
              tenantId: siteId,
              childId,
              startsOn: { lte: date },
              OR: [{ endsOn: null }, { endsOn: { gte: date } }],
            },
            select: { id: true },
          }),
          tx.studentIdentity.findUnique({
            where: { tenantId_userId: { tenantId: siteId, userId } },
            select: { id: true },
          }),
          tx.permissionDefinition.findUnique({
            where: { key: "ace.parent.progress.read" },
            select: { isActive: true },
          }),
        ],
      );
      if (!relationship || !enrollment || student || !permission?.isActive) {
        throw new NotFoundException("Family summary not found");
      }
      return `${relationship.child.firstName} ${relationship.child.lastName}`.trim();
    });
  }

  private async loadSection<T>(
    section: "attendance" | "notices" | "messages",
    read: () => Promise<T>,
  ): Promise<FamilySectionResult<T>> {
    if (!isFamilySectionEnabled(section)) return { status: "unavailable" };
    try {
      return { status: "ready", data: await read() };
    } catch (error) {
      if (error instanceof NotFoundException) return { status: "unavailable" };
      this.logger.error(`Family ${section} summary failed`);
      return {
        status: "error",
        message: "This section could not be loaded. Please try again.",
      };
    }
  }
}
