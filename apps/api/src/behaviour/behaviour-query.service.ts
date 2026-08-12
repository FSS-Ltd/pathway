import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { withTenantRlsContext, type Prisma } from "@pathway/db";
import { EffectivePermissionsService } from "../access-control/effective-permissions.service";
import {
  behaviourEntryQuerySelect,
  toBehaviourEntryResponse,
  type BehaviourEntryRecord,
} from "./behaviour-entry.support";
import type { BehaviourActor } from "./behaviour-command.service";
import type { BehaviourListQuery } from "./dto/behaviour-entry.dto";

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

    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      await this.requireActiveSite(tx, actor);
      if (query.childId) {
        const child = await tx.child.findFirst({
          where: { id: query.childId, tenantId: actor.tenantId },
          select: { id: true },
        });
        if (!child) throw new NotFoundException("Child not found");
      }

      const where: Prisma.BehaviourEntryWhereInput = {
        tenantId: actor.tenantId,
        ...(query.childId ? { childId: query.childId } : {}),
        ...(query.type ? { type: query.type } : {}),
        ...(sensitiveDecision.allowed ? {} : { visibility: "GENERAL" }),
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
      };
      const entries = (await tx.behaviourEntry.findMany({
        where,
        orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
        take: query.limit ?? DEFAULT_LIST_LIMIT,
        select: behaviourEntryQuerySelect,
      })) as BehaviourEntryRecord[];

      return { items: entries.map(toBehaviourEntryResponse) };
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
