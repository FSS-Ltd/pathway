import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, withTenantRlsContext } from "@pathway/db";
import { EffectivePermissionsService } from "../access-control/effective-permissions.service";
import {
  behaviourEntryQuerySelect,
  toBehaviourEntryResponse,
  type BehaviourEntryRecord,
} from "./behaviour-entry.support";
import type { BehaviourActor } from "./behaviour-command.service";
import {
  behaviourHistoryCursorScope,
  decodeBehaviourHistoryCursor,
  encodeBehaviourHistoryCursor,
  requireBehaviourHistoryCursorSigningKey,
} from "./behaviour-history-cursor";
import type { BehaviourListQuery } from "./dto/behaviour-entry.dto";
import { currentReviewerKinds } from "./behaviour-review-access";

const DEFAULT_LIST_LIMIT = 50;

@Injectable()
export class BehaviourQueryService {
  constructor(
    @Inject(EffectivePermissionsService)
    private readonly permissions: EffectivePermissionsService,
  ) {}

  async list(actor: BehaviourActor, query: BehaviourListQuery) {
    this.assertActor(actor);
    const sensitiveDecision = await this.permissions.resolve({
      ...actor,
      permission: "ace.behaviour.sensitive.read",
      now: new Date(),
    });
    if (query.visibility === "SENSITIVE" && !sensitiveDecision.allowed) {
      throw new ForbiddenException(
        "Sensitive behaviour permission is required",
      );
    }
    const scope = behaviourHistoryCursorScope(
      actor,
      query,
      sensitiveDecision.allowed,
    );
    let cursor: ReturnType<typeof decodeBehaviourHistoryCursor> | undefined;
    if (query.cursor) {
      requireBehaviourHistoryCursorSigningKey();
      try {
        cursor = decodeBehaviourHistoryCursor(query.cursor, scope);
      } catch {
        throw new BadRequestException("Invalid behaviour history cursor");
      }
    }

    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      await this.requireActiveSite(tx, actor);
      if (query.childId) {
        const child = await tx.child.findFirst({
          where: { id: query.childId, tenantId: actor.tenantId },
          select: { id: true },
        });
        if (!child) throw new NotFoundException("Child not found");
      }

      const snapshotAt = cursor
        ? cursor.snapshotAt
        : (
            await tx.$queryRaw<Array<{ snapshotAt: Date }>>(
              Prisma.sql`SELECT CURRENT_TIMESTAMP AS "snapshotAt"`,
            )
          )[0]?.snapshotAt;
      if (!snapshotAt)
        throw new Error("Behaviour history snapshot unavailable");
      const requestedVisibility = query.visibility ?? "ALL";
      const effectiveVisibility =
        requestedVisibility === "GENERAL" || !sensitiveDecision.allowed
          ? "GENERAL"
          : requestedVisibility === "SENSITIVE"
            ? "SENSITIVE"
            : undefined;
      const where: Prisma.BehaviourEntryWhereInput = {
        tenantId: actor.tenantId,
        ...(query.childId ? { childId: query.childId } : {}),
        ...(query.type ? { type: query.type } : {}),
        ...(effectiveVisibility ? { visibility: effectiveVisibility } : {}),
        ...(query.occurredFrom || query.occurredTo
          ? {
              occurredAt: {
                ...(query.occurredFrom
                  ? { gte: new Date(query.occurredFrom) }
                  : {}),
                ...(query.occurredTo
                  ? { lte: new Date(query.occurredTo) }
                  : {}),
              },
            }
          : {}),
        correction: { is: null },
        retraction: { is: null },
        createdAt: { lte: snapshotAt },
        ...(cursor
          ? {
              OR: [
                { occurredAt: { lt: cursor.occurredAt } },
                { occurredAt: cursor.occurredAt, id: { lt: cursor.id } },
              ],
            }
          : {}),
      };
      const limit = query.limit ?? DEFAULT_LIST_LIMIT;
      const entries = (await tx.behaviourEntry.findMany({
        where,
        orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
        take: limit + 1,
        select: behaviourEntryQuerySelect,
      })) as BehaviourEntryRecord[];

      const reviewerKinds = await currentReviewerKinds(tx, actor, new Date());
      const page = entries.slice(0, limit);
      const last = page.at(-1);
      return {
        items: page.map(toBehaviourEntryResponse),
        nextCursor:
          entries.length > limit && last
            ? encodeBehaviourHistoryCursor(
                { occurredAt: last.occurredAt, id: last.id, snapshotAt },
                scope,
              )
            : null,
        canVoid: reviewerKinds.length > 0,
      };
    });
  }

  private assertActor(actor: BehaviourActor): void {
    if (
      !actor.tenantId?.trim() ||
      !actor.orgId?.trim() ||
      !actor.userId?.trim()
    ) {
      throw new BadRequestException("A complete active-site actor is required");
    }
  }

  private async requireActiveSite(
    tx: Prisma.TransactionClient,
    actor: BehaviourActor,
  ): Promise<void> {
    const site = await tx.tenant.findFirst({
      where: { id: actor.tenantId, orgId: actor.orgId },
      select: { id: true },
    });
    if (!site) throw new NotFoundException("Active site not found");
  }
}
