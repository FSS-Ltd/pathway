import {
  BadRequestException,
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
import type { ReviewRequestsQuery } from "./dto/demerit-stage.dto";

@Injectable()
export class BehaviourReviewService {
  constructor(
    @Inject(EffectivePermissionsService)
    private readonly permissions: EffectivePermissionsService,
  ) {}

  async list(actor: BehaviourActor, query: ReviewRequestsQuery) {
    await requireActiveBehaviourActor(actor);
    const now = new Date();
    const decision = await this.permissions.resolve({
      ...actor,
      permission: "ace.behaviour.sensitive.read",
      now,
    });
    if (!decision.allowed)
      throw new ForbiddenException("Behaviour access denied");

    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
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
}
