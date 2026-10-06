import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { withTenantRlsContext } from "@pathway/db";
import type { PaceDiagnosticQuery } from "./dto/pace-diagnostic-query.dto";
import {
  createPaceDiagnosticCursorScope,
  decodePaceDiagnosticCursor,
  encodePaceDiagnosticCursor,
} from "./pace-diagnostic-cursor";
import type { PaceQueryActor } from "./pace-query.service";

const DEFAULT_LIMIT = 50;

@Injectable()
export class PaceDiagnosticQueryService {
  async list(actor: PaceQueryActor, query: PaceDiagnosticQuery) {
    if (
      !actor.tenantId?.trim() ||
      !actor.orgId?.trim() ||
      !actor.userId?.trim()
    ) {
      throw new BadRequestException("A complete active-site actor is required");
    }

    const includeRetracted = query.includeRetracted === "true";
    const scope = createPaceDiagnosticCursorScope({
      tenantId: actor.tenantId,
      orgId: actor.orgId,
      childId: query.childId,
      subjectId: query.subjectId,
      includeRetracted,
    });
    let cursor: ReturnType<typeof decodePaceDiagnosticCursor> | undefined;
    if (query.cursor) {
      try {
        cursor = decodePaceDiagnosticCursor(query.cursor, scope);
      } catch {
        throw new BadRequestException("Invalid diagnostic cursor");
      }
    }

    const limit = query.limit ?? DEFAULT_LIMIT;
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      const [site, child, subject] = await Promise.all([
        tx.tenant.findFirst({
          where: { id: actor.tenantId, orgId: actor.orgId },
          select: { id: true },
        }),
        tx.child.findFirst({
          where: { id: query.childId, tenantId: actor.tenantId },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            preferredName: true,
          },
        }),
        tx.subject.findFirst({
          where: { id: query.subjectId, tenantId: actor.tenantId },
          select: { id: true, name: true },
        }),
      ]);
      if (!site) throw new NotFoundException("Active site not found");
      if (!child || !subject) {
        throw new NotFoundException("Diagnostic history not found");
      }

      const rows = await tx.paceDiagnosticResult.findMany({
        where: {
          tenantId: actor.tenantId,
          childId: query.childId,
          subjectId: query.subjectId,
          ...(!includeRetracted ? { retraction: { is: null } } : {}),
          ...(cursor
            ? {
                OR: [
                  { recordedAt: { lt: cursor.createdAt } },
                  { recordedAt: cursor.createdAt, id: { lt: cursor.id } },
                ],
              }
            : {}),
        },
        select: {
          id: true,
          enrollmentId: true,
          level: true,
          outcome: true,
          recordedAt: true,
          recordedBy: { select: { id: true, displayName: true, name: true } },
          retraction: {
            select: {
              id: true,
              reason: true,
              retractedAt: true,
              retractedBy: {
                select: { id: true, displayName: true, name: true },
              },
            },
          },
        },
        orderBy: [{ recordedAt: "desc" }, { id: "desc" }],
        take: limit + 1,
      });
      const page = rows.slice(0, limit);
      const last = page.at(-1);
      return {
        selection: {
          child: {
            id: child.id,
            displayName:
              child.preferredName?.trim() ||
              `${child.firstName} ${child.lastName}`.trim(),
          },
          subject: { id: subject.id, name: subject.name },
        },
        items: page.map((row) => ({
          id: row.id,
          enrollmentId: row.enrollmentId,
          level: row.level,
          outcome: row.outcome,
          recordedAt: row.recordedAt.toISOString(),
          recordedBy: displayActor(row.recordedBy),
          retraction: row.retraction
            ? {
                id: row.retraction.id,
                reason: row.retraction.reason,
                retractedAt: row.retraction.retractedAt.toISOString(),
                retractedBy: displayActor(row.retraction.retractedBy),
              }
            : null,
        })),
        nextCursor:
          rows.length > limit && last
            ? encodePaceDiagnosticCursor({
                createdAt: last.recordedAt,
                id: last.id,
                scope,
              })
            : null,
      };
    });
  }
}

function displayActor(actor: {
  id: string;
  displayName: string | null;
  name: string | null;
}) {
  return {
    id: actor.id,
    displayName: actor.displayName ?? actor.name ?? "Staff member",
  };
}
