import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { withTenantRlsContext } from "@pathway/db";
import { EffectivePermissionsService } from "../access-control/effective-permissions.service";
import { FinanceAccessService } from "./access/finance-access.service";
import type { FinanceRequestActor } from "./finance-controller-support";
import type {
  FinanceCaseAction,
  FinanceCaseList,
} from "./dto/finance-reconciliation.dto";
import { executeFinanceCaseAction } from "./reconciliation/finance-case-command";
import { caseInclude, caseView } from "./reconciliation/finance-case-view";

@Injectable()
export class FinanceReconciliationService {
  constructor(
    @Inject(FinanceAccessService) private readonly access: FinanceAccessService,
    @Inject(EffectivePermissionsService)
    private readonly permissions: EffectivePermissionsService,
  ) {}

  async list(actor: FinanceRequestActor, query: FinanceCaseList) {
    await this.authorize(actor, false);
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      const rows = await tx.financeReconciliationCase.findMany({
        where: {
          tenantId: actor.tenantId,
          orgId: actor.orgId,
          status: query.status,
          currency: query.currency,
          ...(query.cursor ? { id: { gt: query.cursor } } : {}),
        },
        orderBy: { id: "asc" },
        take: query.limit + 1,
        include: caseInclude,
      });
      return {
        items: rows.slice(0, query.limit).map(caseView),
        nextCursor:
          rows.length > query.limit
            ? (rows[query.limit - 1]?.id ?? null)
            : null,
        accessMode: await this.access.resolveMode(actor),
      };
    });
  }

  async get(actor: FinanceRequestActor, id: string) {
    await this.authorize(actor, false);
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      const row = await tx.financeReconciliationCase.findFirst({
        where: { id, tenantId: actor.tenantId, orgId: actor.orgId },
        include: caseInclude,
      });
      if (!row) throw new NotFoundException("Reconciliation case unavailable");
      const [coverage, events, evidence] = await Promise.all([
        tx.financeReconciliationState.findMany({
          where: {
            stripeConnectionId: row.stripeConnectionId,
            tenantId: actor.tenantId,
            orgId: actor.orgId,
          },
          select: {
            stream: true,
            completedThrough: true,
            lastSucceededAt: true,
            windowFrom: true,
            windowTo: true,
            lastError: true,
            retryAfter: true,
          },
          orderBy: { stream: "asc" },
        }),
        tx.financeReconciliationCaseEvent.findMany({
          where: { caseId: id, tenantId: actor.tenantId, orgId: actor.orgId },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 101,
        }),
        tx.financeStripeWebhookEvent.findMany({
          where: {
            tenantId: actor.tenantId,
            orgId: actor.orgId,
            stripeAccountId: row.stripeConnection.stripeAccountId,
            livemode: row.stripeConnection.livemode,
            OR: [
              { reconciliationConnectionId: row.stripeConnectionId },
              { reconciliationConnectionId: null },
            ],
          },
          select: {
            id: true,
            stripeEventId: true,
            eventType: true,
            status: true,
            evidenceSource: true,
            receivedAt: true,
            processedAt: true,
          },
          orderBy: { receivedAt: "desc" },
          take: 50,
        }),
      ]);
      return {
        ...caseView(row),
        coverage,
        events: events.slice(0, 100),
        nextEventCursor: events.length > 100 ? (events[99]?.id ?? null) : null,
        evidence,
        accessMode: await this.access.resolveMode(actor),
      };
    });
  }

  async history(actor: FinanceRequestActor, id: string, cursor?: string) {
    await this.authorize(actor, false);
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      const record = await tx.financeReconciliationCase.findFirst({
        where: { id, tenantId: actor.tenantId, orgId: actor.orgId },
        select: { id: true },
      });
      if (!record)
        throw new NotFoundException("Reconciliation case unavailable");
      if (
        cursor &&
        !(await tx.financeReconciliationCaseEvent.findFirst({
          where: {
            id: cursor,
            caseId: id,
            tenantId: actor.tenantId,
            orgId: actor.orgId,
          },
          select: { id: true },
        }))
      )
        throw new NotFoundException("Case history cursor unavailable");
      const events = await tx.financeReconciliationCaseEvent.findMany({
        where: { caseId: id, tenantId: actor.tenantId, orgId: actor.orgId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 101,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      return {
        events: events.slice(0, 100),
        nextEventCursor: events.length > 100 ? (events[99]?.id ?? null) : null,
      };
    });
  }

  async act(
    actor: FinanceRequestActor,
    id: string,
    action: "ACKNOWLEDGE" | "RECHECK" | "REPLAY",
    input: FinanceCaseAction,
  ) {
    await this.authorize(actor, true);
    return withTenantRlsContext(actor.tenantId, actor.orgId, (tx) =>
      executeFinanceCaseAction(
        tx,
        actor,
        id,
        action,
        input,
        () => this.authorize(actor, true),
        () => this.access.resolveMode(actor),
      ),
    );
  }

  private async authorize(
    actor: FinanceRequestActor,
    write: boolean,
  ): Promise<void> {
    await this.access.assertStaffAction(
      actor,
      write ? "RECONCILE" : "READ_RECORDS",
    );
    const decision = await this.permissions.resolve({
      ...actor,
      permission: write ? "finance.payments.manage" : "finance.invoices.read",
      now: new Date(),
    });
    if (!decision.allowed)
      throw new ForbiddenException("Finance permission required");
  }
}
