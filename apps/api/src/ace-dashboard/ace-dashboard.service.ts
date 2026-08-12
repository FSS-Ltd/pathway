import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, withTenantRlsContext } from "@pathway/db";
import { z } from "zod";
import {
  aceDashboardQuerySchema,
  type AceDashboardQuery,
  type AceDashboardResponse,
} from "./dto/ace-dashboard.dto";

export interface AceDashboardActor {
  tenantId: string;
  orgId: string;
  userId: string;
}

type CountValue = bigint | number | null | undefined;

interface PaceAggregateRow {
  ahead: CountValue;
  onTrack: CountValue;
  atRisk: CountValue;
  behind: CountValue;
  blocked: CountValue;
  stale: CountValue;
}

interface BehaviourAggregateRow {
  siteReview: CountValue;
  headReview: CountValue;
}

@Injectable()
export class AceDashboardService {
  async get(
    query: unknown,
    actor: AceDashboardActor,
  ): Promise<AceDashboardResponse> {
    this.assertActor(actor);
    const parsedQuery = parseQuery(query);

    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      const timezone = await this.requireSiteTimezone(tx, actor);
      const localDate = parsedQuery.date ?? localDateAt(new Date(), timezone);
      const dateBounds = localDateBounds(localDate, timezone);
      const databaseDate = new Date(`${localDate}T12:00:00.000Z`);

      const [attendanceRows, childCount, paceRows, behaviourRows] =
        await Promise.all([
          tx.attendance.groupBy({
            by: ["status"],
            where: {
              timestamp: { gte: dateBounds.start, lt: dateBounds.end },
              child: { tenantId: actor.tenantId },
            },
            _count: { _all: true },
          }),
          tx.child.count({ where: { tenantId: actor.tenantId } }),
          tx.$queryRaw<PaceAggregateRow[]>(
            paceAggregateQuery(actor.tenantId, databaseDate),
          ),
          tx.$queryRaw<BehaviourAggregateRow[]>(
            behaviourAggregateQuery({
              tenantId: actor.tenantId,
              orgId: actor.orgId,
              localDate,
              start: dateBounds.start,
              end: dateBounds.end,
            }),
          ),
        ]);

      const attendance = attendanceCounts(attendanceRows, childCount);
      return {
        localDate,
        timezone,
        attendance,
        pace: paceCounts(paceRows[0]),
        behaviour: behaviourCounts(behaviourRows[0]),
      };
    });
  }

  private assertActor(actor: AceDashboardActor): void {
    if (
      !actor.tenantId?.trim() ||
      !actor.orgId?.trim() ||
      !actor.userId?.trim()
    ) {
      throw new BadRequestException("A complete active-site actor is required");
    }
  }

  private async requireSiteTimezone(
    tx: Prisma.TransactionClient,
    actor: AceDashboardActor,
  ): Promise<string> {
    const site = await tx.tenant.findFirst({
      where: { id: actor.tenantId, orgId: actor.orgId },
      select: { timezone: true },
    });
    if (!site) throw new NotFoundException("Active site not found");
    if (!isIanaTimezone(site.timezone)) {
      throw new BadRequestException("The active site has an invalid timezone");
    }
    return site.timezone;
  }
}

function parseQuery(query: unknown): AceDashboardQuery {
  try {
    return aceDashboardQuerySchema.parse(query);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new BadRequestException(error.flatten());
    }
    throw error;
  }
}

function attendanceCounts(
  rows: Array<{ status: string; _count: { _all: number } }>,
  childCount: number,
): AceDashboardResponse["attendance"] {
  const counts = { present: 0, absent: 0, late: 0 };
  for (const row of rows) {
    if (row.status === "PRESENT") counts.present = row._count._all;
    if (row.status === "ABSENT") counts.absent = row._count._all;
    if (row.status === "LATE") counts.late = row._count._all;
  }
  const marked = counts.present + counts.absent + counts.late;
  return { ...counts, unmarked: Math.max(childCount - marked, 0) };
}

function paceCounts(
  row: PaceAggregateRow | undefined,
): AceDashboardResponse["pace"] {
  return {
    ahead: toCount(row?.ahead),
    onTrack: toCount(row?.onTrack),
    atRisk: toCount(row?.atRisk),
    behind: toCount(row?.behind),
    blocked: toCount(row?.blocked),
    stale: toCount(row?.stale),
  };
}

function behaviourCounts(
  row: BehaviourAggregateRow | undefined,
): AceDashboardResponse["behaviour"] {
  return {
    siteReview: toCount(row?.siteReview),
    headReview: toCount(row?.headReview),
  };
}

function toCount(value: CountValue): number {
  return Number(value ?? 0);
}

function paceAggregateQuery(tenantId: string, localDate: Date) {
  return Prisma.sql`
    WITH current_enrolments AS (
      SELECT
        progress."trackStatus" AS "trackStatus",
        progress."blockCode" AS "blockCode",
        (
          progress.id IS NULL
          OR progress."lastAssessmentId" IS DISTINCT FROM terminal.id
          OR COALESCE(terminal."latestCreatedAt" > progress."rebuiltAt", false)
        ) AS "isStale"
      FROM "StudentSubjectEnrollment" AS enrollment
      LEFT JOIN "PaceProgress" AS progress
        ON progress."tenantId" = enrollment."tenantId"
        AND progress."childId" = enrollment."childId"
        AND progress."subjectId" = enrollment."subjectId"
      LEFT JOIN LATERAL (
        SELECT
          fact.id,
          MAX(fact."createdAt") OVER () AS "latestCreatedAt"
        FROM "PaceAssessment" AS fact
        WHERE fact."tenantId" = enrollment."tenantId"
          AND fact."childId" = enrollment."childId"
          AND fact."subjectId" = enrollment."subjectId"
          AND NOT EXISTS (
            SELECT 1
            FROM "PaceAssessment" AS correction
            WHERE correction."tenantId" = fact."tenantId"
              AND correction."childId" = fact."childId"
              AND correction."subjectId" = fact."subjectId"
              AND correction."correctsAssessmentId" = fact.id
          )
        ORDER BY fact."assessedOn" DESC, fact."createdAt" DESC, fact.id DESC
        LIMIT 1
      ) AS terminal ON TRUE
      WHERE enrollment."tenantId" = ${tenantId}
        AND enrollment.status = 'ACTIVE'
        AND enrollment."startsOn" <= ${localDate}
        AND (enrollment."endsOn" IS NULL OR enrollment."endsOn" >= ${localDate})
    )
    SELECT
      COUNT(*) FILTER (
        WHERE NOT "isStale" AND "blockCode" IS NULL AND "trackStatus" = 'AHEAD'
      ) AS "ahead",
      COUNT(*) FILTER (
        WHERE NOT "isStale" AND "blockCode" IS NULL AND "trackStatus" = 'ON_TRACK'
      ) AS "onTrack",
      COUNT(*) FILTER (
        WHERE NOT "isStale" AND "blockCode" IS NULL AND "trackStatus" = 'AT_RISK'
      ) AS "atRisk",
      COUNT(*) FILTER (
        WHERE NOT "isStale" AND "blockCode" IS NULL AND "trackStatus" = 'BEHIND'
      ) AS "behind",
      COUNT(*) FILTER (
        WHERE NOT "isStale" AND ("trackStatus" = 'BLOCKED' OR "blockCode" IS NOT NULL)
      ) AS "blocked",
      COUNT(*) FILTER (WHERE "isStale") AS "stale"
    FROM current_enrolments
  `;
}

function behaviourAggregateQuery(input: {
  tenantId: string;
  orgId: string;
  localDate: string;
  start: Date;
  end: Date;
}) {
  return Prisma.sql`
    SELECT
      COUNT(*) FILTER (WHERE event.payload->>'reviewKind' = 'SITE') AS "siteReview",
      COUNT(*) FILTER (WHERE event.payload->>'reviewKind' = 'HEAD') AS "headReview"
    FROM "OutboxEvent" AS event
    WHERE event."orgId" = ${input.orgId}
      AND event."eventType" = 'behaviour.review-requested'
      AND event."createdAt" >= ${input.start}
      AND event."createdAt" < ${input.end}
      AND event.payload->>'tenantId' = ${input.tenantId}
      AND event.payload->>'occurredOn' = ${input.localDate}
      AND NOT EXISTS (
        SELECT 1
        FROM "BehaviourEntry" AS correction
        WHERE correction."tenantId" = ${input.tenantId}
          AND correction."correctsBehaviourEntryId" = event."aggregateId"
      )
  `;
}

function localDateAt(instant: Date, timezone: string): string {
  const parts = dateTimeParts(instant, timezone);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

function localDateBounds(localDate: string, timezone: string) {
  return {
    start: localMidnightToUtc(localDate, timezone),
    end: localMidnightToUtc(addCalendarDays(localDate, 1), timezone),
  };
}

function localMidnightToUtc(localDate: string, timezone: string): Date {
  const [year, month, day] = localDate.split("-").map(Number);
  const target = Date.UTC(year!, month! - 1, day!);
  let candidate = target;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = dateTimeParts(new Date(candidate), timezone);
    const represented = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    const corrected = candidate + (target - represented);
    if (corrected === candidate) return new Date(candidate);
    candidate = corrected;
  }
  return new Date(candidate);
}

function dateTimeParts(instant: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    second: value("second"),
  };
}

function addCalendarDays(localDate: string, days: number): string {
  const [year, month, day] = localDate.split("-").map(Number);
  const shifted = new Date(Date.UTC(year!, month! - 1, day! + days));
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

function isIanaTimezone(value: string | null): value is string {
  if (!value?.trim()) return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
