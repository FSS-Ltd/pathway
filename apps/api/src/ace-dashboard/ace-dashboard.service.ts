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

interface AttendanceAggregateRow {
  present: CountValue;
  absent: CountValue;
  late: CountValue;
  unmarked: CountValue;
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

      const [attendanceRows, paceRows, behaviourRows] = await Promise.all([
        tx.$queryRaw<AttendanceAggregateRow[]>(
          attendanceAggregateQuery(
            actor.tenantId,
            dateBounds.start,
            dateBounds.end,
          ),
        ),
        tx.$queryRaw<PaceAggregateRow[]>(
          paceAggregateQuery(actor.tenantId, databaseDate),
        ),
        tx.$queryRaw<BehaviourAggregateRow[]>(
          behaviourAggregateQuery({
            tenantId: actor.tenantId,
            orgId: actor.orgId,
            start: dateBounds.start,
            end: dateBounds.end,
          }),
        ),
      ]);

      return {
        localDate,
        timezone,
        attendance: attendanceCounts(attendanceRows[0]),
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
  row: AttendanceAggregateRow | undefined,
): AceDashboardResponse["attendance"] {
  return {
    present: toCount(row?.present),
    absent: toCount(row?.absent),
    late: toCount(row?.late),
    unmarked: toCount(row?.unmarked),
  };
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

function attendanceAggregateQuery(
  tenantId: string,
  start: Date,
  end: Date,
): Prisma.Sql {
  return Prisma.sql`
    WITH site_children AS (
      SELECT child.id
      FROM "Child" AS child
      WHERE child."tenantId" = ${tenantId}
    ),
    daily_terminal_status AS (
      SELECT DISTINCT ON (attendance."childId")
        attendance."childId",
        attendance.status
      FROM "Attendance" AS attendance
      INNER JOIN site_children AS child
        ON child.id = attendance."childId"
      WHERE attendance.timestamp >= ${start}
        AND attendance.timestamp < ${end}
      ORDER BY
        attendance."childId",
        attendance.timestamp DESC,
        attendance.id DESC
    )
    SELECT
      COUNT(*) FILTER (WHERE status.status = 'PRESENT') AS "present",
      COUNT(*) FILTER (WHERE status.status = 'ABSENT') AS "absent",
      COUNT(*) FILTER (WHERE status.status = 'LATE') AS "late",
      COUNT(*) FILTER (WHERE status."childId" IS NULL) AS "unmarked"
    FROM site_children AS child
    LEFT JOIN daily_terminal_status AS status
      ON status."childId" = child.id
  `;
}

function paceAggregateQuery(tenantId: string, localDate: Date): Prisma.Sql {
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
        ORDER BY fact."assessedOn" DESC, fact.id DESC
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
  start: Date;
  end: Date;
}): Prisma.Sql {
  return Prisma.sql`
    WITH RECURSIVE terminal_facts AS (
      SELECT
        fact.id,
        fact."correctsBehaviourEntryId"
      FROM "BehaviourEntry" AS fact
      WHERE fact."tenantId" = ${input.tenantId}
        AND fact.type = 'DEMERIT'
        AND fact."occurredAt" >= ${input.start}
        AND fact."occurredAt" < ${input.end}
        AND NOT EXISTS (
          SELECT 1
          FROM "BehaviourEntry" AS successor
          WHERE successor."tenantId" = ${input.tenantId}
            AND successor."correctsBehaviourEntryId" = fact.id
        )
    ),
    fact_lineage AS (
      SELECT
        terminal.id AS "terminalId",
        terminal.id AS "factId",
        terminal."correctsBehaviourEntryId" AS "predecessorId"
      FROM terminal_facts AS terminal

      UNION ALL

      SELECT
        lineage."terminalId",
        predecessor.id AS "factId",
        predecessor."correctsBehaviourEntryId" AS "predecessorId"
      FROM fact_lineage AS lineage
      INNER JOIN "BehaviourEntry" AS predecessor
        ON predecessor.id = lineage."predecessorId"
        AND predecessor."tenantId" = ${input.tenantId}
    ),
    current_review_states AS (
      SELECT
        terminal.id,
        current_policy."action" AS "currentAction"
      FROM terminal_facts AS terminal
      INNER JOIN LATERAL (
        SELECT audit.metadata->>'demeritAction' AS "action"
        FROM "AuditEvent" AS audit
        WHERE audit."entityId" = terminal.id
          AND audit."tenantId" = ${input.tenantId}
          AND audit."orgId" = ${input.orgId}
          AND audit."entityType" = 'ACE_RECORD'
          AND audit.action = 'CREATED'
          AND audit.metadata->>'operation' IN (
            'BEHAVIOUR_ENTRY_RECORDED',
            'BEHAVIOUR_ENTRY_CORRECTED'
          )
        ORDER BY audit."createdAt" DESC, audit.id DESC
        LIMIT 1
      ) AS current_policy ON TRUE
      WHERE EXISTS (
        SELECT 1
        FROM fact_lineage AS lineage
        INNER JOIN "OutboxEvent" AS event
          ON event."aggregateType" = 'BEHAVIOUR_ENTRY'
          AND event."aggregateId" = lineage."factId"
          AND event."eventType" = 'behaviour.review-requested'
          AND event."orgId" = ${input.orgId}
          AND event.payload->>'tenantId' = ${input.tenantId}
        WHERE lineage."terminalId" = terminal.id
      )
    )
    SELECT
      COUNT(*) FILTER (WHERE state."currentAction" = 'review') AS "siteReview",
      COUNT(*) FILTER (WHERE state."currentAction" = 'head-review') AS "headReview"
    FROM current_review_states AS state
  `;
}

function localDateAt(instant: Date, timezone: string): string {
  const parts = dateTimeParts(instant, timezone);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

function localDateBounds(
  localDate: string,
  timezone: string,
): { start: Date; end: Date } {
  return {
    start: firstInstantOfLocalDate(localDate, timezone),
    end: firstInstantOfLocalDate(addCalendarDays(localDate, 1), timezone),
  };
}

function firstInstantOfLocalDate(localDate: string, timezone: string): Date {
  const [year, month, day] = localDate.split("-").map(Number);
  const nominalUtc = Date.UTC(year!, month! - 1, day!);
  let before = nominalUtc - 36 * 60 * 60 * 1_000;
  let atOrAfter = nominalUtc + 36 * 60 * 60 * 1_000;

  while (atOrAfter - before > 1) {
    const middle = before + Math.floor((atOrAfter - before) / 2);
    if (localDateAt(new Date(middle), timezone) < localDate) {
      before = middle;
    } else {
      atOrAfter = middle;
    }
  }

  return new Date(atOrAfter);
}

function dateTimeParts(
  instant: Date,
  timezone: string,
): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
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
