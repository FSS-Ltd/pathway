import { BadRequestException, NotFoundException } from "@nestjs/common";
import {
  type AceDailyAbsenceReason,
  type AttendanceStatus,
  type Prisma,
} from "@pathway/db";
import type { FamilyDailyAttendanceQuery } from "./dto/family-daily-attendance-query.dto";

export interface FamilyDailyAttendanceHistory {
  siteId: string;
  childId: string;
  from: string;
  to: string;
  counts: { present: number; absent: number; late: number };
  items: Array<{
    date: string;
    status: AttendanceStatus;
    absenceReason: AceDailyAbsenceReason | null;
  }>;
}

export async function readFamilyDailyAttendanceHistory(
  tx: Prisma.TransactionClient,
  siteId: string,
  childId: string,
  timezone: string | null,
  query: FamilyDailyAttendanceQuery,
): Promise<FamilyDailyAttendanceHistory> {
  const today = timezone && localDate(new Date(), timezone);
  if (!today) throw new NotFoundException("Daily attendance not found");
  if (query.to > today) {
    throw new BadRequestException("End date cannot be after today");
  }

  const rows = await tx.aceDailyAttendance.findMany({
    where: {
      tenantId: siteId,
      childId,
      date: {
        gte: new Date(`${query.from}T00:00:00.000Z`),
        lte: new Date(`${query.to}T00:00:00.000Z`),
      },
    },
    select: { date: true, status: true, absenceReason: true },
    orderBy: { date: "desc" },
    take: 366,
  });
  const counts = { present: 0, absent: 0, late: 0 };
  const items = rows.map((row) => {
    if (row.status === "PRESENT") counts.present += 1;
    if (row.status === "ABSENT") counts.absent += 1;
    if (row.status === "LATE") counts.late += 1;
    return {
      date: row.date.toISOString().slice(0, 10),
      status: row.status,
      absenceReason: row.absenceReason,
    };
  });
  return { siteId, childId, from: query.from, to: query.to, counts, items };
}

function localDate(now: Date, timezone: string): string | null {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const value = (type: "year" | "month" | "day") =>
      parts.find((part) => part.type === type)?.value;
    const year = value("year");
    const month = value("month");
    const day = value("day");
    return year && month && day ? `${year}-${month}-${day}` : null;
  } catch {
    return null;
  }
}
