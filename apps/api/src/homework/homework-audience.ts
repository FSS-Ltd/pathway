import { createHash } from "node:crypto";
import type { Prisma } from "@pathway/db";
import type { HomeworkActor } from "./homework-access";

export function siteCalendarDate(now: Date, timezone: string | null): Date {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone ?? "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: "year" | "month" | "day") =>
    parts.find((value) => value.type === type)?.value;
  return new Date(
    `${part("year")}-${part("month")}-${part("day")}T00:00:00.000Z`,
  );
}

export async function resolveHomeworkAudience(
  tx: Prisma.TransactionClient,
  actor: HomeworkActor,
  academicYearId: string,
  yearBandId: string,
  today: Date,
): Promise<Map<string, string>> {
  const enrollments = await tx.aceSchoolEnrollment.findMany({
    where: {
      tenantId: actor.tenantId,
      academicYearId,
      yearBandId,
      startsOn: { lte: today },
      OR: [{ endsOn: null }, { endsOn: { gte: today } }],
      child: { isGuest: false },
    },
    orderBy: [{ startsOn: "desc" }, { id: "desc" }],
    select: { id: true, childId: true },
  });
  const audience = new Map<string, string>();
  for (const enrollment of enrollments) {
    if (!audience.has(enrollment.childId)) {
      audience.set(enrollment.childId, enrollment.id);
    }
  }
  return audience;
}

export function audienceFingerprint(audience: Map<string, string>): string {
  const entries = [...audience].sort(([left], [right]) =>
    left.localeCompare(right),
  );
  return createHash("sha256").update(JSON.stringify(entries)).digest("hex");
}
