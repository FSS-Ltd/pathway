import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  Prisma,
  withTenantRlsContext,
  type Prisma as PrismaTypes,
} from "@pathway/db";
import type { PaceExceptionsQuery } from "./dto/pace-query.dto";
import {
  createPaceExceptionCursorScope,
  decodePaceExceptionCursor,
  encodePaceExceptionCursor,
} from "./pace-cursor";
import type { PaceQueryActor } from "./pace-query.service";

const DEFAULT_EXCEPTION_LIMIT = 50;

type PaceTrackStatus = "AHEAD" | "ON_TRACK" | "AT_RISK" | "BEHIND" | "BLOCKED";
type PaceException = "ABSENT" | "STALE" | "BLOCKED" | "BEHIND" | "WARNING";

interface ExceptionRecord {
  enrollmentId: string;
  enrollmentCreatedAt: Date;
  childId: string;
  subjectId: string;
  subjectName: string;
  progressId: string | null;
  currentPace: number;
  targetPace: number;
  trackStatus: PaceTrackStatus | null;
  blockCode: string | null;
  lastAssessmentId: string | null;
  rebuiltAt: Date | null;
  terminalAssessmentId: string | null;
  terminalAssessedOn: Date | null;
  terminalCreatedAt: Date | null;
}

@Injectable()
export class PaceExceptionsService {
  async listExceptions(actor: PaceQueryActor, query: PaceExceptionsQuery) {
    this.assertActor(actor);
    const limit = query.limit ?? DEFAULT_EXCEPTION_LIMIT;
    const cursorScope = createPaceExceptionCursorScope({
      tenantId: actor.tenantId,
      orgId: actor.orgId,
    });
    const cursor = query.cursor
      ? this.parseCursor(query.cursor, cursorScope)
      : undefined;

    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      await this.requireActiveSite(tx, actor);
      const rows = await tx.$queryRaw<ExceptionRecord[]>(
        buildExceptionsQuery(actor.tenantId, cursor, limit),
      );
      const page = rows.slice(0, limit);
      const last = page.at(-1);

      return {
        items: page.map(toExceptionItem),
        nextCursor:
          rows.length > limit && last
            ? encodePaceExceptionCursor({
                createdAt: last.enrollmentCreatedAt,
                id: last.enrollmentId,
                scope: cursorScope,
              })
            : null,
      };
    });
  }

  private assertActor(actor: PaceQueryActor): void {
    if (
      !actor.tenantId?.trim() ||
      !actor.orgId?.trim() ||
      !actor.userId?.trim()
    ) {
      throw new BadRequestException("A complete active-site actor is required");
    }
  }

  private parseCursor(encodedCursor: string, cursorScope: string) {
    try {
      const cursor = decodePaceExceptionCursor(encodedCursor);
      if (cursor.scope !== cursorScope)
        throw new Error("Cursor scope mismatch");
      return cursor;
    } catch {
      throw new BadRequestException("Invalid PACE exceptions cursor");
    }
  }

  private async requireActiveSite(
    tx: PrismaTypes.TransactionClient,
    actor: PaceQueryActor,
  ): Promise<void> {
    const site = await tx.tenant.findFirst({
      where: { id: actor.tenantId, orgId: actor.orgId },
      select: { id: true },
    });
    if (!site) throw new NotFoundException("Active site not found");
  }
}

function buildExceptionsQuery(
  tenantId: string,
  cursor: ReturnType<typeof decodePaceExceptionCursor> | undefined,
  limit: number,
) {
  const predicates = [
    Prisma.sql`enrollment."tenantId" = ${tenantId}`,
    Prisma.sql`enrollment.status = 'ACTIVE'`,
    Prisma.sql`(
      progress.id IS NULL
      OR progress."trackStatus" IN ('BEHIND', 'BLOCKED')
      OR progress."blockCode" IS NOT NULL
      OR progress."lastAssessmentId" IS DISTINCT FROM terminal.id
      OR terminal."latestCreatedAt" > progress."rebuiltAt"
    )`,
  ];
  if (cursor) {
    predicates.push(Prisma.sql`(
      enrollment."createdAt" < ${cursor.createdAt}
      OR (enrollment."createdAt" = ${cursor.createdAt} AND enrollment.id < ${cursor.id})
    )`);
  }

  return Prisma.sql`
    SELECT
      enrollment.id AS "enrollmentId",
      enrollment."createdAt" AS "enrollmentCreatedAt",
      enrollment."childId" AS "childId",
      subject.id AS "subjectId",
      subject.name AS "subjectName",
      progress.id AS "progressId",
      COALESCE(progress."currentPace", enrollment."currentPace") AS "currentPace",
      COALESCE(progress."targetPace", enrollment."targetPace") AS "targetPace",
      progress."trackStatus" AS "trackStatus",
      progress."blockCode" AS "blockCode",
      progress."lastAssessmentId" AS "lastAssessmentId",
      progress."rebuiltAt" AS "rebuiltAt",
      terminal.id AS "terminalAssessmentId",
      terminal."assessedOn" AS "terminalAssessedOn",
      terminal."latestCreatedAt" AS "terminalCreatedAt"
    FROM "StudentSubjectEnrollment" AS enrollment
    INNER JOIN "Subject" AS subject
      ON subject.id = enrollment."subjectId"
      AND subject."tenantId" = enrollment."tenantId"
    LEFT JOIN "PaceProgress" AS progress
      ON progress."tenantId" = enrollment."tenantId"
      AND progress."childId" = enrollment."childId"
      AND progress."subjectId" = enrollment."subjectId"
    LEFT JOIN LATERAL (
      SELECT
        fact.id,
        fact."assessedOn",
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
    WHERE ${Prisma.join(predicates, " AND ")}
    ORDER BY enrollment."createdAt" DESC, enrollment.id DESC
    LIMIT ${limit + 1}
  `;
}

function toExceptionItem(row: ExceptionRecord) {
  return {
    enrollmentId: row.enrollmentId,
    child: { id: row.childId },
    subject: { id: row.subjectId, name: row.subjectName },
    currentPace: row.currentPace,
    targetPace: row.targetPace,
    status: row.trackStatus,
    blockCode: row.blockCode,
    lastAssessmentId: row.lastAssessmentId,
    lastAssessmentOn:
      row.terminalAssessedOn?.toISOString().slice(0, 10) ?? null,
    rebuiltAt: row.rebuiltAt?.toISOString() ?? null,
    exceptions: classifyExceptions(row),
  };
}

function classifyExceptions(row: ExceptionRecord): PaceException[] {
  if (!row.progressId) return ["ABSENT"];

  const exceptions: PaceException[] = [];
  if (
    row.lastAssessmentId !== row.terminalAssessmentId ||
    (row.terminalCreatedAt !== null &&
      row.rebuiltAt !== null &&
      row.terminalCreatedAt > row.rebuiltAt)
  ) {
    exceptions.push("STALE");
  }
  if (row.trackStatus === "BLOCKED") exceptions.push("BLOCKED");
  if (row.trackStatus === "BEHIND") exceptions.push("BEHIND");
  if (row.blockCode) exceptions.push("WARNING");
  return exceptions;
}
