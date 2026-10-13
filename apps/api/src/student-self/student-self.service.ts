import { isAceVertical } from "@pathway/types";
import { Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { prisma, withTenantRlsContext } from "@pathway/db";
import { StudentDailyAttendanceService } from "../attendance/student-daily-attendance.service";
import {
  localDate,
  type FamilyDailyAttendanceHistory,
} from "../attendance/family-daily-attendance-history";
import {
  isStudentAttendanceEnabled,
  UNAVAILABLE_STUDENT_SECTIONS,
} from "./student-self-release-policy";

type AttendanceResult =
  | { status: "ready"; data: FamilyDailyAttendanceHistory }
  | { status: "unavailable" }
  | { status: "error"; message: string };

export interface StudentSelfSummary {
  siteId: string;
  childName: string;
  asOf: Date;
  sections: {
    attendance: AttendanceResult;
  } & typeof UNAVAILABLE_STUDENT_SECTIONS;
}

@Injectable()
export class StudentSelfService {
  private readonly logger = new Logger(StudentSelfService.name);

  constructor(
    @Inject(StudentDailyAttendanceService)
    private readonly attendance: StudentDailyAttendanceService,
  ) {}

  async summary(siteId: string, userId: string): Promise<StudentSelfSummary> {
    const site = await prisma.tenant.findUnique({
      where: { id: siteId },
      select: {
        orgId: true,
        timezone: true,
        org: { select: { orgVertical: { select: { vertical: true } } } },
      },
    });
    if (!site || !isAceVertical(site.org.orgVertical?.vertical)) {
      throw new NotFoundException("Student summary not found");
    }
    const asOf = new Date();
    const schoolDay = localDate(asOf, site.timezone ?? "");
    if (!schoolDay) throw new NotFoundException("Student summary not found");
    const childName = await this.requireCurrentStudent(
      siteId,
      site.orgId,
      userId,
      asOf,
      schoolDay,
    );
    const from = new Date(
      Date.parse(`${schoolDay}T00:00:00.000Z`) - 29 * 86_400_000,
    )
      .toISOString()
      .slice(0, 10);
    let attendance: AttendanceResult = { status: "unavailable" };
    if (isStudentAttendanceEnabled()) {
      try {
        attendance = {
          status: "ready",
          data: await this.attendance.list(
            siteId,
            { from, to: schoolDay },
            userId,
          ),
        };
      } catch (error) {
        if (error instanceof NotFoundException) {
          attendance = { status: "unavailable" };
        } else {
          this.logger.error("Student attendance summary failed");
          attendance = {
            status: "error",
            message: "Attendance could not be loaded. Please try again.",
          };
        }
      }
    }
    const checkedAt = new Date();
    const checkedSchoolDay = localDate(checkedAt, site.timezone ?? "");
    if (!checkedSchoolDay)
      throw new NotFoundException("Student summary not found");
    await this.requireCurrentStudent(
      siteId,
      site.orgId,
      userId,
      checkedAt,
      checkedSchoolDay,
    );
    return {
      siteId,
      childName,
      asOf,
      sections: { attendance, ...UNAVAILABLE_STUDENT_SECTIONS },
    };
  }

  private async requireCurrentStudent(
    siteId: string,
    orgId: string,
    userId: string,
    now: Date,
    schoolDay: string,
  ): Promise<string> {
    const date = new Date(`${schoolDay}T00:00:00.000Z`);
    return withTenantRlsContext(siteId, orgId, async (tx) => {
      const [policy, links] = await Promise.all([
        tx.studentPortalPolicy.findUnique({
          where: { tenantId: siteId },
          select: { studentPortalEnabled: true },
        }),
        tx.studentIdentityLink.findMany({
          where: {
            tenantId: siteId,
            linkedAt: { lte: now },
            endedAt: null,
            revokedAt: null,
            studentIdentity: {
              tenantId: siteId,
              userId,
              user: { isActive: true },
            },
            child: { tenantId: siteId, isGuest: false },
          },
          select: {
            child: { select: { id: true, firstName: true, lastName: true } },
          },
          take: 2,
        }),
      ]);
      if (!policy?.studentPortalEnabled || links.length !== 1) {
        throw new NotFoundException("Student summary not found");
      }
      const child = links[0].child;
      const enrollment = await tx.aceSchoolEnrollment.findFirst({
        where: {
          tenantId: siteId,
          childId: child.id,
          startsOn: { lte: date },
          OR: [{ endsOn: null }, { endsOn: { gte: date } }],
        },
        select: { id: true },
      });
      if (!enrollment) throw new NotFoundException("Student summary not found");
      return `${child.firstName} ${child.lastName}`.trim();
    });
  }
}
