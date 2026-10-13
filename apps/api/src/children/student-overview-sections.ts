import { Logger } from "@nestjs/common";
import type { Prisma } from "@pathway/db";
import { withTenantRlsContext } from "@pathway/db";
import { loadDemeritStageSnapshot } from "../behaviour/demerit-stage.snapshot";
import type { StudentOverviewResponse } from "./dto/student-overview.dto";

type Sections = StudentOverviewResponse["sections"];
export type OverviewPeriod = StudentOverviewResponse["period"];
const logger = new Logger("StudentOverviewSections");

export interface OverviewReadContext {
  siteId: string;
  orgId: string;
  childId: string;
  timezone: string;
  period: OverviewPeriod;
  now: Date;
}

export async function readOverviewSection<K extends keyof Sections>(
  name: K,
  read: () => Promise<Sections[K]>,
): Promise<Sections[K]> {
  try {
    return await read();
  } catch {
    // A failed optional summary must not hide the student profile.
    logger.error(name + " overview summary failed");
    return { status: "error" } as Sections[K];
  }
}

export async function readAttendance(
  context: OverviewReadContext,
  isAceSchool: boolean,
): Promise<Sections["attendance"]> {
  return withTenantRlsContext(context.siteId, context.orgId, async (tx) => {
    const range = {
      gte: new Date(`${context.period.from}T00:00:00.000Z`),
      lte: new Date(`${context.period.to}T23:59:59.999Z`),
    };
    const rows = isAceSchool
      ? await tx.aceDailyAttendance.findMany({
          where: {
            tenantId: context.siteId,
            childId: context.childId,
            date: range,
          },
          select: { status: true },
        })
      : await tx.attendance.findMany({
          where: {
            childId: context.childId,
            group: { tenantId: context.siteId },
            timestamp: range,
          },
          select: { status: true },
        });
    if (rows.length === 0) return { status: "empty" };
    const present = rows.filter((row) => row.status === "PRESENT").length;
    const absent = rows.filter((row) => row.status === "ABSENT").length;
    const late = rows.filter((row) => row.status === "LATE").length;
    return {
      status: "ready",
      data: {
        total: rows.length,
        present,
        absent,
        late,
        attendanceRate: Math.round(((present + late) / rows.length) * 100),
      },
    };
  });
}

export async function readAcademics(
  context: OverviewReadContext,
): Promise<Sections["academics"]> {
  return withTenantRlsContext(context.siteId, context.orgId, async (tx) => {
    const versions = await tx.aceTermReportVersion.findMany({
      where: {
        tenantId: context.siteId,
        guardianVisibleAt: { lte: context.now },
        report: {
          childId: context.childId,
          academicPeriod: {
            startsOn: { lte: new Date(`${context.period.to}T00:00:00.000Z`) },
            endsOn: { gte: new Date(`${context.period.from}T00:00:00.000Z`) },
          },
        },
      },
      orderBy: [{ guardianVisibleAt: "desc" }, { versionNumber: "desc" }],
      take: 100,
      select: {
        reportId: true,
        guardianVisibleAt: true,
        familyPayload: true,
        report: { select: { academicPeriod: { select: { name: true } } } },
      },
    });
    const seen = new Set<string>();
    const reports = versions.flatMap((version) => {
      if (seen.has(version.reportId)) return [];
      seen.add(version.reportId);
      const payload = toRecord(version.familyPayload);
      return [
        {
          periodName: version.report.academicPeriod.name,
          publishedAt: version.guardianVisibleAt.toISOString(),
          summary:
            typeof payload?.summary === "string" ? payload.summary : null,
        },
      ];
    });
    return reports.length
      ? { status: "ready", data: { reports } }
      : { status: "empty" };
  });
}

export async function readPace(
  context: OverviewReadContext,
): Promise<Sections["pace"]> {
  return withTenantRlsContext(context.siteId, context.orgId, async (tx) => {
    const placements = await tx.studentSubjectEnrollment.findMany({
      where: {
        tenantId: context.siteId,
        childId: context.childId,
        status: "ACTIVE",
      },
      select: {
        subjectId: true,
        currentPace: true,
        targetPace: true,
        subject: { select: { name: true } },
      },
      orderBy: { subject: { name: "asc" } },
    });
    if (placements.length === 0) return { status: "empty" };
    const progress = await tx.paceProgress.findMany({
      where: {
        tenantId: context.siteId,
        childId: context.childId,
        subjectId: { in: placements.map((item) => item.subjectId) },
      },
      select: {
        subjectId: true,
        currentPace: true,
        targetPace: true,
        completedPaces: true,
        trackStatus: true,
      },
    });
    const bySubject = new Map(progress.map((item) => [item.subjectId, item]));
    return {
      status: "ready",
      data: {
        subjects: placements.map((item) => {
          const projection = bySubject.get(item.subjectId);
          return {
            subjectId: item.subjectId,
            subjectName: item.subject.name,
            currentPace: projection?.currentPace ?? item.currentPace,
            targetPace: projection?.targetPace ?? item.targetPace,
            completedPaces: projection?.completedPaces ?? 0,
            trackStatus: projection?.trackStatus ?? null,
          };
        }),
      },
    };
  });
}

export async function readBehaviour(
  context: OverviewReadContext,
): Promise<{ behaviour: Sections["behaviour"]; merits: Sections["merits"] }> {
  return withTenantRlsContext(context.siteId, context.orgId, async (tx) => {
    const rows = await tx.behaviourEntry.groupBy({
      by: ["type"],
      where: {
        tenantId: context.siteId,
        childId: context.childId,
        visibility: "GENERAL",
        correction: { is: null },
        retraction: { is: null },
        occurredAt: {
          gte: new Date(`${context.period.from}T00:00:00.000Z`),
          lte: new Date(`${context.period.to}T23:59:59.999Z`),
        },
      },
      _count: { _all: true },
      _sum: { pointsDelta: true },
    });
    if (rows.length === 0)
      return { behaviour: { status: "empty" }, merits: { status: "empty" } };
    const count = (type: "MERIT" | "DEMERIT" | "GENERAL") =>
      rows.find((entry) => entry.type === type)?._count._all ?? 0;
    const merits = rows.find((entry) => entry.type === "MERIT");
    return {
      behaviour: {
        status: "ready",
        data: {
          merits: count("MERIT"),
          demerits: count("DEMERIT"),
          general: count("GENERAL"),
        },
      },
      merits: merits
        ? {
            status: "ready",
            data: {
              count: merits._count._all,
              points: merits._sum.pointsDelta ?? 0,
            },
          }
        : { status: "empty" },
    };
  });
}

export async function readDiscipline(
  context: OverviewReadContext,
): Promise<Sections["discipline"]> {
  return withTenantRlsContext(context.siteId, context.orgId, async (tx) => {
    const snapshot = await loadDemeritStageSnapshot(
      tx,
      context.siteId,
      context.childId,
      context.period.to,
      context.timezone,
      context.now,
    );
    return snapshot
      ? {
          status: "ready",
          data: { stage: snapshot.stage, stageLabel: snapshot.stageLabel },
        }
      : { status: "unavailable", reason: "No discipline policy is configured" };
  });
}

function toRecord(value: Prisma.JsonValue): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : null;
}
