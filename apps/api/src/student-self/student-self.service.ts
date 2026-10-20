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
import { requireCurrentStudent } from "./current-student";

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
    homework: { status: "ready" | "unavailable" };
  } & Omit<typeof UNAVAILABLE_STUDENT_SECTIONS, "homework">;
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
    const childName = await withTenantRlsContext(
      siteId,
      site.orgId,
      async (tx) =>
        (await requireCurrentStudent(tx, siteId, userId, asOf, schoolDay)).name,
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
    await withTenantRlsContext(siteId, site.orgId, async (tx) =>
      requireCurrentStudent(tx, siteId, userId, checkedAt, checkedSchoolDay),
    );
    return {
      siteId,
      childName,
      asOf,
      sections: {
        attendance,
        ...UNAVAILABLE_STUDENT_SECTIONS,
        homework: {
          status:
            process.env.ACE_HOMEWORK_SUBMISSIONS_ENABLED === "true"
              ? "ready"
              : "unavailable",
        },
      },
    };
  }
}
