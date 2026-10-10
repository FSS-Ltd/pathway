import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { withTenantRlsContext, type Prisma } from "@pathway/db";
import { EffectivePermissionsService } from "../access-control/effective-permissions.service";
import { requireActiveBehaviourActor } from "./behaviour-actor";
import type { BehaviourActor } from "./behaviour-command.service";
import { currentReviewerKinds } from "./behaviour-review-access";
import {
  behaviourEntryQuerySelect,
  toBehaviourEntryResponse,
} from "./behaviour-entry.support";
import type { ReviewRequestsQuery } from "./dto/demerit-stage.dto";

@Injectable()
export class BehaviourReviewService {
  constructor(
    @Inject(EffectivePermissionsService)
    private readonly permissions: EffectivePermissionsService,
  ) {}

  async list(actor: BehaviourActor, query: ReviewRequestsQuery) {
    await this.requireSensitiveActor(actor);
    const now = new Date();
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      const kinds = await this.requireReviewerKinds(tx, actor, now);
      if (query.childId) {
        const child = await tx.child.findFirst({
          where: {
            id: query.childId,
            tenantId: actor.tenantId,
            isGuest: false,
          },
          select: { id: true },
        });
        if (!child) throw new NotFoundException("Child not found");
      }

      const visibleKinds = kinds.includes("HEAD") ? ["SITE", "HEAD"] : ["SITE"];
      const scope: Prisma.BehaviourReviewRequestWhereInput = {
        tenantId: actor.tenantId,
        child: { isGuest: false },
        kind: { in: visibleKinds },
        ...(query.childId ? { childId: query.childId } : {}),
      };
      const cursor = query.cursor
        ? await tx.behaviourReviewRequest.findFirst({
            where: { ...scope, id: query.cursor },
            select: { id: true, requestedAt: true },
          })
        : null;
      if (query.cursor && !cursor)
        throw new BadRequestException("Invalid review cursor");

      const limit = query.limit ?? 50;
      const rows = await tx.behaviourReviewRequest.findMany({
        where: {
          ...scope,
          ...(cursor
            ? {
                OR: [
                  { requestedAt: { lt: cursor.requestedAt } },
                  {
                    requestedAt: cursor.requestedAt,
                    id: { lt: cursor.id },
                  },
                ],
              }
            : {}),
        },
        orderBy: [{ requestedAt: "desc" }, { id: "desc" }],
        take: limit + 1,
        select: {
          id: true,
          childId: true,
          behaviourEntryId: true,
          demeritStageOverrideId: true,
          kind: true,
          stage: true,
          policyVersion: true,
          requestedAt: true,
        },
      });
      const items = rows.slice(0, limit);
      return {
        items,
        nextCursor: rows.length > limit ? (items.at(-1)?.id ?? null) : null,
      };
    });
  }

  async fact(actor: BehaviourActor, requestId: string) {
    await this.requireSensitiveActor(actor);
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      const kinds = await this.requireReviewerKinds(tx, actor, new Date());
      const request = await tx.behaviourReviewRequest.findFirst({
        where: {
          id: requestId,
          tenantId: actor.tenantId,
          child: { isGuest: false },
          kind: { in: kinds.includes("HEAD") ? ["SITE", "HEAD"] : ["SITE"] },
        },
        select: { childId: true, behaviourEntryId: true },
      });
      if (!request?.behaviourEntryId)
        throw new NotFoundException("Review fact not found");

      let entryId = request.behaviourEntryId;
      for (let depth = 0; depth < 100; depth += 1) {
        const successor = await tx.behaviourEntry.findFirst({
          where: {
            tenantId: actor.tenantId,
            childId: request.childId,
            correctsBehaviourEntryId: entryId,
          },
          select: { id: true },
        });
        if (successor) {
          entryId = successor.id;
          continue;
        }
        const entry = await tx.behaviourEntry.findFirst({
          where: {
            id: entryId,
            tenantId: actor.tenantId,
            childId: request.childId,
          },
          select: behaviourEntryQuerySelect,
        });
        if (!entry) throw new NotFoundException("Review fact not found");
        return {
          entry: toBehaviourEntryResponse(entry),
        };
      }
      throw new ConflictException("Review fact correction chain is too deep");
    });
  }

  private async requireSensitiveActor(actor: BehaviourActor): Promise<void> {
    await requireActiveBehaviourActor(actor);
    const decision = await this.permissions.resolve({
      ...actor,
      permission: "ace.behaviour.sensitive.read",
      now: new Date(),
    });
    if (!decision.allowed)
      throw new ForbiddenException("Behaviour access denied");
  }

  private async requireReviewerKinds(
    tx: Prisma.TransactionClient,
    actor: BehaviourActor,
    now: Date,
  ) {
    const [site, vertical, kinds] = await Promise.all([
      tx.tenant.findFirst({
        where: { id: actor.tenantId, orgId: actor.orgId },
        select: { id: true },
      }),
      tx.orgVertical.findFirst({
        where: { orgId: actor.orgId, vertical: "ACE_SCHOOL" },
        select: { orgId: true },
      }),
      currentReviewerKinds(tx, actor, now),
    ]);
    if (!site || !vertical) throw new NotFoundException("ACE site not found");
    if (kinds.length === 0)
      throw new ForbiddenException("A current Head or Lead role is required");
    return kinds;
  }
}
