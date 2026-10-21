import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { withTenantRlsContext } from "@pathway/db";
import { AuditAction, AuditEntityType } from "../audit/audit.types";
import { recordAuditEventInTransaction } from "../audit/audit.service";
import { FinanceAccessService } from "./access/finance-access.service";
import type { FinanceRequestActor } from "./finance-controller-support";
import type {
  FinancePayerAccountCreateInput,
  FinancePayerAccountListQuery,
} from "./dto/finance-payer-account.dto";
import { FinanceCommandService } from "./finance-command.service";

export type FinancePayerAccountActor = FinanceRequestActor;

@Injectable()
export class FinancePayerAccountService {
  constructor(
    @Inject(FinanceAccessService)
    private readonly access: FinanceAccessService,
    @Inject(FinanceCommandService)
    private readonly commands: FinanceCommandService,
  ) {}

  async list(
    actor: FinancePayerAccountActor,
    query: FinancePayerAccountListQuery,
  ) {
    await this.access.assertStaffAction(actor, "READ_RECORDS");
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      const rows = await tx.financePayerAccount.findMany({
        where: { tenantId: actor.tenantId, orgId: actor.orgId },
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
        orderBy: [{ displayName: "asc" }, { id: "asc" }],
        take: query.limit + 1,
        select: { id: true, displayName: true, createdAt: true },
      });
      const hasMore = rows.length > query.limit;
      const items = rows.slice(0, query.limit);
      return {
        nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null,
        items: items.map((item) => ({
          id: item.id,
          displayName: item.displayName,
          createdAt: item.createdAt.toISOString(),
        })),
      };
    });
  }

  async create(
    actor: FinancePayerAccountActor,
    idempotencyKey: string,
    input: FinancePayerAccountCreateInput,
  ) {
    await this.access.assertStaffAction(actor, "CREATE_INVOICE");
    const displayName = input.displayName.trim();
    return this.commands.execute({
      actor,
      idempotencyKey,
      commandType: "CREATE_PAYER_ACCOUNT",
      resourceType: "PAYER_ACCOUNT",
      request: { displayName },
      perform: async (tx) => {
        const profile = await tx.financeProfile.findUnique({
          where: {
            tenantId_orgId: { tenantId: actor.tenantId, orgId: actor.orgId },
          },
          select: { id: true },
        });
        if (!profile) throw new NotFoundException("Finance profile not found");
        const account = await tx.financePayerAccount.create({
          data: {
            financeProfileId: profile.id,
            tenantId: actor.tenantId,
            orgId: actor.orgId,
            displayName,
          },
          select: { id: true, displayName: true, createdAt: true },
        });
        await recordAuditEventInTransaction(tx, {
          actorUserId: actor.userId,
          tenantId: actor.tenantId,
          orgId: actor.orgId,
          entityType: AuditEntityType.FINANCE_PAYER_ACCOUNT,
          entityId: account.id,
          action: AuditAction.CREATED,
          metadata: { financeProfileId: profile.id },
        });
        return {
          resourceId: account.id,
          value: {
            id: account.id,
            displayName: account.displayName,
            createdAt: account.createdAt.toISOString(),
          },
        };
      },
      replay: (tx, accountId) =>
        tx.financePayerAccount
          .findFirst({
            where: {
              id: accountId,
              tenantId: actor.tenantId,
              orgId: actor.orgId,
            },
            select: { id: true, displayName: true, createdAt: true },
          })
          .then((account) => {
            if (!account)
              throw new NotFoundException("Finance account not found");
            return {
              id: account.id,
              displayName: account.displayName,
              createdAt: account.createdAt.toISOString(),
            };
          }),
    });
  }
}
