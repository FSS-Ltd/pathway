import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  Prisma,
  withTenantRlsContext,
  type Prisma as PrismaTypes,
} from "@pathway/db";
import { parsePaceNumber, rebuildPaceProgress } from "@pathway/ace-domain";
import type { PaceRosterQuery } from "./dto/pace-query.dto";
import {
  createPaceRosterCursorScope,
  decodePaceRosterCursor,
  encodePaceRosterCursor,
} from "./pace-cursor";

const DEFAULT_ROSTER_LIMIT = 50;

type PaceTrackStatus = "AHEAD" | "ON_TRACK" | "AT_RISK" | "BEHIND" | "BLOCKED";

export interface PaceQueryActor {
  tenantId: string;
  orgId: string;
  userId: string;
}

interface RosterRecord {
  enrollmentId: string;
  enrollmentCreatedAt: Date;
  childId: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  groupId: string | null;
  groupName: string | null;
  subjectId: string;
  subjectName: string;
  currentPace: number;
  targetPace: number;
  trackStatus: PaceTrackStatus | null;
  rebuiltAt: Date | null;
}

interface PaceProgressRecord {
  subjectId: string;
  currentPace: number;
  targetPace: number;
  trackStatus: PaceTrackStatus;
  rebuiltAt: Date;
}

const childProgressSelect = {
  id: true,
  firstName: true,
  lastName: true,
  preferredName: true,
  group: { select: { id: true, name: true } },
  subjectEnrollments: {
    where: { status: "ACTIVE" },
    orderBy: [{ subject: { name: "asc" } }, { id: "asc" }],
    select: {
      currentPace: true,
      targetPace: true,
      subject: { select: { id: true, name: true } },
    },
  },
} satisfies PrismaTypes.ChildSelect;

const paceProgressSelect = {
  subjectId: true,
  currentPace: true,
  targetPace: true,
  trackStatus: true,
  rebuiltAt: true,
} satisfies PrismaTypes.PaceProgressSelect;

@Injectable()
export class PaceQueryService {
  async listRoster(actor: PaceQueryActor, query: PaceRosterQuery) {
    this.assertActor(actor);
    const normalizedQuery = normalizeRosterQuery(query);
    const limit = normalizedQuery.limit ?? DEFAULT_ROSTER_LIMIT;
    const cursorScope = createPaceRosterCursorScope({
      tenantId: actor.tenantId,
      orgId: actor.orgId,
      subjectId: normalizedQuery.subjectId ?? null,
      status: normalizedQuery.status ?? null,
      groupId: normalizedQuery.groupId ?? null,
      search: normalizedQuery.search ?? null,
    });
    const cursor = normalizedQuery.cursor
      ? this.parseCursor(normalizedQuery.cursor, cursorScope)
      : undefined;

    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      await this.requireActiveSite(tx, actor);
      const rows = await tx.$queryRaw<RosterRecord[]>(
        buildRosterQuery(actor.tenantId, normalizedQuery, cursor, limit),
      );
      const page = rows.slice(0, limit);
      const last = page.at(-1);

      return {
        items: page.map(toRosterItem),
        nextCursor:
          rows.length > limit && last
            ? encodePaceRosterCursor({
                createdAt: last.enrollmentCreatedAt,
                id: last.enrollmentId,
                scope: cursorScope,
              })
            : null,
      };
    });
  }

  async getChildProgress(childId: string, actor: PaceQueryActor) {
    this.assertActor(actor);
    if (!childId?.trim()) throw new BadRequestException("A child is required");

    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      await this.requireActiveSite(tx, actor);
      const child = await tx.child.findFirst({
        where: { id: childId, tenantId: actor.tenantId },
        select: childProgressSelect,
      });
      if (!child) throw new NotFoundException("Child not found");

      const subjectIds = child.subjectEnrollments.map(
        (enrollment) => enrollment.subject.id,
      );
      const progress = subjectIds.length
        ? await tx.paceProgress.findMany({
            where: {
              tenantId: actor.tenantId,
              childId: child.id,
              subjectId: { in: subjectIds },
            },
            select: paceProgressSelect,
          })
        : [];
      const progressBySubject = new Map(
        progress.map((row) => [row.subjectId, row as PaceProgressRecord]),
      );

      return {
        child: {
          id: child.id,
          displayName: toDisplayName(child),
          group: child.group,
        },
        subjects: child.subjectEnrollments.map((enrollment) => {
          const subjectProgress = progressBySubject.get(enrollment.subject.id);
          const currentPace = subjectProgress?.currentPace ?? enrollment.currentPace;
          const targetPace = subjectProgress?.targetPace ?? enrollment.targetPace;
          return {
            subject: enrollment.subject,
            currentPace,
            targetPace,
            status: subjectProgress?.trackStatus ?? null,
            currentLevel: currentPaceLevel(currentPace),
            rebuiltAt: subjectProgress?.rebuiltAt.toISOString() ?? null,
          };
        }),
      };
    });
  }

  private assertActor(actor: PaceQueryActor): void {
    if (!actor.tenantId?.trim() || !actor.orgId?.trim() || !actor.userId?.trim()) {
      throw new BadRequestException("A complete active-site actor is required");
    }
  }

  private parseCursor(encodedCursor: string, cursorScope: string) {
    try {
      const cursor = decodePaceRosterCursor(encodedCursor);
      if (cursor.scope !== cursorScope) throw new Error("Cursor scope mismatch");
      return cursor;
    } catch {
      throw new BadRequestException("Invalid roster cursor");
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

function buildRosterQuery(
  tenantId: string,
  query: PaceRosterQuery,
  cursor: ReturnType<typeof decodePaceRosterCursor> | undefined,
  limit: number,
) {
  const predicates = [Prisma.sql`enrollment."tenantId" = ${tenantId}`, Prisma.sql`enrollment.status = 'ACTIVE'`];

  if (query.subjectId) predicates.push(Prisma.sql`enrollment."subjectId" = ${query.subjectId}`);
  if (query.status) {
    predicates.push(
      Prisma.sql`progress."trackStatus" = ${query.status}::"PaceTrackStatus"`,
    );
  }
  if (query.groupId) predicates.push(Prisma.sql`child."groupId" = ${query.groupId}`);
  if (query.search) {
    const search = `%${query.search}%`;
    predicates.push(Prisma.sql`(
      child."firstName" ILIKE ${search}
      OR child."lastName" ILIKE ${search}
      OR child."preferredName" ILIKE ${search}
    )`);
  }
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
      child.id AS "childId",
      child."firstName" AS "firstName",
      child."lastName" AS "lastName",
      child."preferredName" AS "preferredName",
      child."groupId" AS "groupId",
      "group".name AS "groupName",
      subject.id AS "subjectId",
      subject.name AS "subjectName",
      COALESCE(progress."currentPace", enrollment."currentPace") AS "currentPace",
      COALESCE(progress."targetPace", enrollment."targetPace") AS "targetPace",
      progress."trackStatus" AS "trackStatus",
      progress."rebuiltAt" AS "rebuiltAt"
    FROM "StudentSubjectEnrollment" AS enrollment
    INNER JOIN "Child" AS child
      ON child.id = enrollment."childId" AND child."tenantId" = enrollment."tenantId"
    INNER JOIN "Subject" AS subject
      ON subject.id = enrollment."subjectId" AND subject."tenantId" = enrollment."tenantId"
    LEFT JOIN "Group" AS "group"
      ON "group".id = child."groupId" AND "group"."tenantId" = child."tenantId"
    LEFT JOIN "PaceProgress" AS progress
      ON progress."tenantId" = enrollment."tenantId"
      AND progress."childId" = enrollment."childId"
      AND progress."subjectId" = enrollment."subjectId"
    WHERE ${Prisma.join(predicates, " AND ")}
    ORDER BY enrollment."createdAt" DESC, enrollment.id DESC
    LIMIT ${limit + 1}
  `;
}

function normalizeRosterQuery(query: PaceRosterQuery): PaceRosterQuery {
  const subjectId = query.subjectId?.toLowerCase();
  const groupId = query.groupId?.toLowerCase();
  const search = query.search?.trim().toLocaleLowerCase();
  return {
    ...query,
    ...(subjectId ? { subjectId } : { subjectId: undefined }),
    ...(groupId ? { groupId } : { groupId: undefined }),
    ...(search ? { search } : { search: undefined }),
  };
}

function toRosterItem(row: RosterRecord) {
  return {
    child: { id: row.childId, displayName: toDisplayName(row) },
    group: row.groupId && row.groupName ? { id: row.groupId, name: row.groupName } : null,
    subject: { id: row.subjectId, name: row.subjectName },
    currentPace: row.currentPace,
    targetPace: row.targetPace,
    status: row.trackStatus,
    currentLevel: currentPaceLevel(row.currentPace),
    rebuiltAt: row.rebuiltAt?.toISOString() ?? null,
  };
}

function toDisplayName(child: {
  firstName: string;
  lastName: string;
  preferredName: string | null;
}): string {
  return child.preferredName?.trim() || `${child.firstName} ${child.lastName}`.trim();
}

function currentPaceLevel(currentPace: number) {
  const pace = parsePaceNumber(currentPace);
  return rebuildPaceProgress({
    assignedLevel: pace.level,
    startingPace: currentPace,
    assessmentFacts: [],
  }).currentLevel;
}
