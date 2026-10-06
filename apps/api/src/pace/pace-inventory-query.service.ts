import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { withTenantRlsContext, type Prisma as PrismaTypes } from "@pathway/db";
import type {
  PaceInventoryOrdersQuery,
  PaceInventoryStockQuery,
} from "./dto/pace-inventory-query.dto";
import {
  createPaceInventoryCursorScope,
  encodePaceInventoryCursor,
  parsePaceInventoryCursor,
} from "./pace-inventory-cursor";
import type { PaceQueryActor } from "./pace-query.service";
import { stockQuery, type StockRecord } from "./pace-inventory-stock-query";

const DEFAULT_LIMIT = 50;

@Injectable()
export class PaceInventoryQueryService {
  async listOrders(actor: PaceQueryActor, query: PaceInventoryOrdersQuery) {
    assertActor(actor);
    const limit = query.limit ?? DEFAULT_LIMIT;
    const childId = query.childId?.toLowerCase();
    const scope = createPaceInventoryCursorScope({
      tenantId: actor.tenantId,
      orgId: actor.orgId,
      view: "orders",
      ...(childId ? { childId } : {}),
      ...(query.status ? { status: query.status } : {}),
    });
    const cursor = readCursor(query.cursor, scope);

    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      await requireActiveSite(tx, actor);
      const rows = await tx.paceInventoryOrder.findMany({
        where: {
          tenantId: actor.tenantId,
          ...(childId ? { childId } : {}),
          ...(query.status ? { status: query.status } : {}),
          ...(cursor
            ? {
                OR: [
                  { createdAt: { lt: cursor.createdAt } },
                  { createdAt: cursor.createdAt, id: { lt: cursor.id } },
                ],
              }
            : {}),
        },
        select: {
          id: true,
          childId: true,
          child: {
            select: { firstName: true, lastName: true, preferredName: true },
          },
          subjectId: true,
          subject: { select: { name: true } },
          paceNumber: true,
          status: true,
          orderedAt: true,
          inTransitAt: true,
          deliveredAt: true,
          createdAt: true,
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit + 1,
      });
      const page = rows.slice(0, limit);
      const last = page.at(-1);
      return {
        items: page.map((row) => ({
          id: row.id,
          child: {
            id: row.childId,
            displayName: displayName(row.child),
          },
          subject: { id: row.subjectId, name: row.subject.name },
          paceNumber: row.paceNumber,
          status: row.status,
          orderedAt: row.orderedAt.toISOString(),
          inTransitAt: row.inTransitAt?.toISOString() ?? null,
          deliveredAt: row.deliveredAt?.toISOString() ?? null,
        })),
        nextCursor:
          rows.length > limit && last
            ? encodePaceInventoryCursor({
                createdAt: last.createdAt,
                id: last.id,
                scope,
              })
            : null,
      };
    });
  }

  async listStock(actor: PaceQueryActor, query: PaceInventoryStockQuery) {
    assertActor(actor);
    const limit = query.limit ?? DEFAULT_LIMIT;
    const attentionOnly = query.attentionOnly === "true";
    const scope = createPaceInventoryCursorScope({
      tenantId: actor.tenantId,
      orgId: actor.orgId,
      view: "stock",
      attentionOnly,
    });
    const cursor = readCursor(query.cursor, scope);

    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      await requireActiveSite(tx, actor);
      const rows = await tx.$queryRaw<StockRecord[]>(
        stockQuery(actor.tenantId, attentionOnly, cursor, limit),
      );
      const page = rows.slice(0, limit);
      const last = page.at(-1);
      return {
        items: page.map((row) => {
          const availableCount = row.futurePaceNumbers.length;
          return {
            child: { id: row.childId, displayName: displayName(row) },
            subject: { id: row.subjectId, name: row.subjectName },
            currentPace: row.currentPace,
            futurePaceNumbers: row.futurePaceNumbers,
            availableCount,
            hasPendingOrder: row.hasPendingOrder,
            stockState:
              availableCount === 0
                ? ("NO_STOCK" as const)
                : availableCount <= 2
                  ? ("LOW_STOCK" as const)
                  : ("SUFFICIENT" as const),
            needsAttention:
              availableCount === 0 ||
              (availableCount <= 2 && !row.hasPendingOrder),
          };
        }),
        nextCursor:
          rows.length > limit && last
            ? encodePaceInventoryCursor({
                createdAt: last.enrollmentCreatedAt,
                id: last.enrollmentId,
                scope,
              })
            : null,
      };
    });
  }
}

function readCursor(encoded: string | undefined, scope: string) {
  if (!encoded) return undefined;
  try {
    return parsePaceInventoryCursor(encoded, scope);
  } catch {
    throw new BadRequestException("Invalid PACE inventory cursor");
  }
}

function assertActor(actor: PaceQueryActor): void {
  if (
    !actor.tenantId?.trim() ||
    !actor.orgId?.trim() ||
    !actor.userId?.trim()
  ) {
    throw new BadRequestException("A complete active-site actor is required");
  }
}

async function requireActiveSite(
  tx: PrismaTypes.TransactionClient,
  actor: PaceQueryActor,
): Promise<void> {
  const site = await tx.tenant.findFirst({
    where: { id: actor.tenantId, orgId: actor.orgId },
    select: { id: true },
  });
  if (!site) throw new NotFoundException("Active site not found");
}

function displayName(child: {
  firstName: string;
  lastName: string;
  preferredName: string | null;
}): string {
  return (
    child.preferredName?.trim() || `${child.firstName} ${child.lastName}`.trim()
  );
}
