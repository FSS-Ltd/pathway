import { runTransaction, withTenantRlsContext } from "@pathway/db";
import type {
  ClaimedFinanceStripeWebhook,
  FinanceStripeWebhookScope,
  FinanceStripeWebhookStore,
} from "./finance-stripe-webhook.job";

interface FinanceStripeWebhookCandidate {
  id: string;
  tenantId: string | null;
  orgId: string | null;
  attempts: number;
}

export class PrismaFinanceStripeWebhookStore implements FinanceStripeWebhookStore {
  constructor(private readonly livemode?: boolean) {}
  async findDueScopes(now: Date): Promise<FinanceStripeWebhookScope[]> {
    return runTransaction(async (tx) => {
      const rows = await tx.$queryRaw<FinanceStripeWebhookScope[]>`
        SELECT "tenantId", "orgId"
        FROM app.list_due_finance_stripe_webhook_scopes(${now})
      `;
      return rows;
    });
  }

  async claim(
    scope: FinanceStripeWebhookScope,
    now: Date,
    reclaimBefore: Date,
    claimToken: string,
    limit: number,
  ): Promise<ClaimedFinanceStripeWebhook[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new RangeError("Invalid Finance Stripe webhook batch size");
    }
    return withTenantRlsContext(scope.tenantId, scope.orgId, async (tx) => {
      const due = await tx.financeStripeWebhookEvent.findMany({
        where: {
          tenantId: scope.tenantId,
          orgId: scope.orgId,
          livemode: this.livemode,
          OR: [
            {
              status: { in: ["RECEIVED", "RETRY"] },
              nextAttemptAt: { lte: now },
            },
            { status: "PROCESSING", claimedAt: { lte: reclaimBefore } },
          ],
        },
        orderBy: [{ nextAttemptAt: "asc" }, { id: "asc" }],
        take: limit,
        select: { id: true, tenantId: true, orgId: true, attempts: true },
      });
      const claimed: ClaimedFinanceStripeWebhook[] = [];
      for (const candidate of due) {
        const event = requireScope(candidate);
        const updated = await tx.financeStripeWebhookEvent.updateMany({
          where: {
            id: event.id,
            tenantId: scope.tenantId,
            orgId: scope.orgId,
            livemode: this.livemode,
            OR: [
              {
                status: { in: ["RECEIVED", "RETRY"] },
                nextAttemptAt: { lte: now },
              },
              { status: "PROCESSING", claimedAt: { lte: reclaimBefore } },
            ],
          },
          data: {
            status: "PROCESSING",
            attempts: { increment: 1 },
            claimedAt: now,
            claimToken,
          },
        });
        if (updated.count === 1) {
          claimed.push({
            ...event,
            attempts: event.attempts + 1,
            claimToken,
          });
        }
      }
      return claimed;
    });
  }

  renew(event: ClaimedFinanceStripeWebhook, claimedAt: Date): Promise<boolean> {
    return withTenantRlsContext(event.tenantId, event.orgId, async (tx) => {
      const result = await tx.financeStripeWebhookEvent.updateMany({
        where: {
          id: event.id,
          tenantId: event.tenantId,
          orgId: event.orgId,
          status: "PROCESSING",
          claimToken: event.claimToken,
        },
        data: { claimedAt },
      });
      return result.count === 1;
    });
  }

  complete(event: ClaimedFinanceStripeWebhook): Promise<boolean> {
    return this.updateClaim(event, {
      status: "COMPLETED",
      processedAt: new Date(),
      claimedAt: null,
      claimToken: null,
      lastError: null,
    });
  }

  defer(event: ClaimedFinanceStripeWebhook): Promise<boolean> {
    return this.updateClaim(event, {
      status: "AWAITING_HANDLER",
      claimedAt: null,
      claimToken: null,
      lastError: null,
    });
  }

  retry(
    event: ClaimedFinanceStripeWebhook,
    nextAttemptAt: Date,
    error: string,
  ): Promise<boolean> {
    return this.updateClaim(event, {
      status: "RETRY",
      nextAttemptAt,
      claimedAt: null,
      claimToken: null,
      lastError: error.slice(0, 1_000),
    });
  }

  deadLetter(
    event: ClaimedFinanceStripeWebhook,
    error: string,
  ): Promise<boolean> {
    return this.updateClaim(event, {
      status: "DEAD_LETTER",
      claimedAt: null,
      claimToken: null,
      lastError: error.slice(0, 1_000),
    });
  }

  private async updateClaim(
    event: ClaimedFinanceStripeWebhook,
    data: {
      status: "COMPLETED" | "AWAITING_HANDLER" | "RETRY" | "DEAD_LETTER";
      processedAt?: Date;
      nextAttemptAt?: Date;
      claimedAt: null;
      claimToken: null;
      lastError: string | null;
    },
  ): Promise<boolean> {
    return withTenantRlsContext(event.tenantId, event.orgId, async (tx) => {
      const result = await tx.financeStripeWebhookEvent.updateMany({
        where: {
          id: event.id,
          tenantId: event.tenantId,
          orgId: event.orgId,
          status: "PROCESSING",
          claimToken: event.claimToken,
        },
        data,
      });
      return result.count === 1;
    });
  }
}

function requireScope(
  event: FinanceStripeWebhookCandidate,
): Omit<ClaimedFinanceStripeWebhook, "claimToken"> {
  if (!event.tenantId || !event.orgId) {
    throw new Error("Unmatched Finance Stripe events cannot be claimed");
  }
  return {
    id: event.id,
    tenantId: event.tenantId,
    orgId: event.orgId,
    attempts: event.attempts,
  };
}
