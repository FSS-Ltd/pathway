import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { withTenantRlsContext } from "@pathway/db";
import { FinanceAccessService } from "../access/finance-access.service";
import type { FinanceAccessScope } from "../access/finance-access.reader";
import { FinanceBalanceService } from "../finance-balance.service";
import { lockInvoice } from "../finance-invoice-operations";
import {
  FINANCE_STRIPE_CHECKOUT_CONFIG,
  type FinanceStripeCheckoutConfig,
} from "./finance-stripe-checkout.config";
import { financeCheckoutIntegrationIdentifier } from "./finance-stripe-checkout.provider";
import type {
  FinanceStripeCheckoutActor,
  FinanceStripeCheckoutPreparation,
  FinanceStripeCheckoutView,
} from "./finance-stripe-checkout.types";

const CHECKOUT_RETRY_WINDOW_MS = 25 * 60 * 60 * 1000;

@Injectable()
export class FinanceStripeCheckoutAttemptService {
  constructor(
    @Inject(FinanceAccessService)
    private readonly financeAccess: FinanceAccessService,
    @Inject(FinanceBalanceService)
    private readonly balances: FinanceBalanceService,
    @Inject(FINANCE_STRIPE_CHECKOUT_CONFIG)
    private readonly config: FinanceStripeCheckoutConfig,
  ) {}

  async prepare(
    actor: FinanceStripeCheckoutActor,
    payerAccountId: string,
    invoiceId: string,
  ): Promise<FinanceStripeCheckoutPreparation> {
    const mode = this.config.mode;
    if (mode === "disabled") {
      throw new ServiceUnavailableException(
        "Finance card payments are not configured",
      );
    }

    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      await this.financeAccess.assertPayerAction(
        actor,
        actor.userId,
        payerAccountId,
        "SETTLE_ISSUED_INVOICE",
      );
      await lockInvoice(tx, actor, invoiceId);

      const invoice = await tx.financeInvoice.findFirst({
        where: {
          id: invoiceId,
          tenantId: actor.tenantId,
          orgId: actor.orgId,
          payerAccountId,
          status: "ISSUED",
        },
        select: {
          id: true,
          financeProfileId: true,
          invoiceNumber: true,
          status: true,
          currency: true,
          totalMinor: true,
        },
      });
      if (!invoice || invoice.invoiceNumber === null) {
        throw new NotFoundException("Finance invoice not found");
      }

      const balance = await this.balances.forInvoices(tx, actor, [invoice]);
      const outstandingMinor = BigInt(
        balance.get(invoice.id)?.outstandingMinor ?? "0",
      );
      if (outstandingMinor <= 0n) {
        throw new ConflictException("This invoice has no amount due");
      }

      const grant = await tx.financePayerGrant.findFirst({
        where: {
          financePayerAccountId: payerAccountId,
          payerUserId: actor.userId,
          tenantId: actor.tenantId,
          orgId: actor.orgId,
          revokedAt: null,
        },
        select: { id: true },
      });
      if (!grant) throw new ForbiddenException("Finance access unavailable");
      const lockedGrant = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "FinancePayerGrant"
        WHERE "id" = ${grant.id}
          AND "tenantId" = ${actor.tenantId}
          AND "orgId" = ${actor.orgId}
          AND "revokedAt" IS NULL
        FOR UPDATE
      `;
      if (lockedGrant.length !== 1) {
        throw new ForbiddenException("Finance access unavailable");
      }

      const connection = await tx.financeStripeConnection.findFirst({
        where: {
          financeProfileId: invoice.financeProfileId,
          tenantId: actor.tenantId,
          orgId: actor.orgId,
          status: "READY",
          livemode: mode === "live",
          stripeAccountId: { not: null },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: {
          id: true,
          stripeAccountId: true,
          livemode: true,
        },
      });
      if (!connection?.stripeAccountId) {
        throw new ServiceUnavailableException(
          "The school card payment account is not ready",
        );
      }

      const now = new Date();
      const existing = await tx.financeCheckoutAttempt.findFirst({
        where: {
          invoiceId,
          tenantId: actor.tenantId,
          orgId: actor.orgId,
          status: { in: ["CREATING", "OPEN", "COMPLETED"] },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: {
          id: true,
          financeProfileId: true,
          stripeConnectionId: true,
          stripeAccountId: true,
          invoiceId: true,
          amountMinor: true,
          currency: true,
          idempotencyKey: true,
          integrationIdentifier: true,
          stripeCheckoutSessionId: true,
          checkoutUrl: true,
          expiresAt: true,
          createdAt: true,
          status: true,
        },
      });

      if (existing) {
        if (
          existing.status !== "CREATING" &&
          existing.status !== "OPEN" &&
          existing.status !== "COMPLETED"
        ) {
          throw new ConflictException(
            "Checkout status changed; please try again",
          );
        }
        if (
          existing.stripeConnectionId !== connection.id ||
          existing.stripeAccountId !== connection.stripeAccountId ||
          existing.currency !== invoice.currency
        ) {
          throw new ConflictException(
            "An earlier checkout is still being resolved",
          );
        }
        if (
          existing.status === "OPEN" &&
          existing.expiresAt &&
          existing.expiresAt > now &&
          existing.checkoutUrl &&
          existing.amountMinor === outstandingMinor
        ) {
          return {
            kind: "view",
            view: {
              attemptId: existing.id,
              status: "OPEN",
              checkoutUrl: existing.checkoutUrl,
              expiresAt: existing.expiresAt.toISOString(),
            },
          };
        }
        if (existing.status === "COMPLETED") {
          return { kind: "view", view: checkingView(existing.id) };
        }
        if (
          existing.status === "OPEN" ||
          now.getTime() - existing.createdAt.getTime() >
            CHECKOUT_RETRY_WINDOW_MS
        ) {
          if (existing.status === "CREATING") {
            await tx.financeCheckoutAttempt.updateMany({
              where: {
                id: existing.id,
                tenantId: actor.tenantId,
                orgId: actor.orgId,
                status: "CREATING",
              },
              data: { status: "EXPIRED" },
            });
          }
          if (existing.status === "OPEN") {
            return {
              kind: "retrieve",
              attempt: {
                ...existing,
                invoiceNumber: invoice.invoiceNumber,
                status: existing.status,
              },
            };
          }
        } else {
          return {
            kind: "create",
            attempt: {
              ...existing,
              invoiceNumber: invoice.invoiceNumber,
              status: existing.status,
            },
          };
        }
      }

      const attemptId = randomUUID();
      const created = await tx.financeCheckoutAttempt.create({
        data: {
          id: attemptId,
          financeProfileId: invoice.financeProfileId,
          stripeConnectionId: connection.id,
          payerGrantId: grant.id,
          invoiceId,
          tenantId: actor.tenantId,
          orgId: actor.orgId,
          stripeAccountId: connection.stripeAccountId,
          livemode: connection.livemode,
          amountMinor: outstandingMinor,
          currency: invoice.currency,
          idempotencyKey: `finance-checkout-${attemptId}`,
          integrationIdentifier: financeCheckoutIntegrationIdentifier(),
        },
        select: {
          id: true,
          financeProfileId: true,
          stripeConnectionId: true,
          stripeAccountId: true,
          invoiceId: true,
          amountMinor: true,
          currency: true,
          idempotencyKey: true,
          integrationIdentifier: true,
          stripeCheckoutSessionId: true,
          checkoutUrl: true,
          expiresAt: true,
          createdAt: true,
          status: true,
        },
      });
      return {
        kind: "create",
        attempt: {
          ...created,
          invoiceNumber: invoice.invoiceNumber,
          status: "CREATING",
        },
      };
    });
  }

  async persistSession(
    actor: FinanceStripeCheckoutActor,
    attemptId: string,
    session: { id: string; url: string; expiresAt: Date },
  ): Promise<void> {
    await withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      const attempt = await tx.financeCheckoutAttempt.findFirst({
        where: {
          id: attemptId,
          tenantId: actor.tenantId,
          orgId: actor.orgId,
        },
        select: { payerGrantId: true },
      });
      if (!attempt) throw new NotFoundException("Checkout attempt not found");
      const lockedGrant = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "FinancePayerGrant"
        WHERE "id" = ${attempt.payerGrantId}
          AND "tenantId" = ${actor.tenantId}
          AND "orgId" = ${actor.orgId}
          AND "revokedAt" IS NULL
        FOR UPDATE
      `;
      if (lockedGrant.length !== 1) {
        throw new ForbiddenException("Finance access unavailable");
      }
      await tx.financeCheckoutAttempt.updateMany({
        where: {
          id: attemptId,
          tenantId: actor.tenantId,
          orgId: actor.orgId,
          status: "CREATING",
        },
        data: {
          status: "OPEN",
          stripeCheckoutSessionId: session.id,
          checkoutUrl: session.url,
          expiresAt: session.expiresAt,
        },
      });
      const latest = await tx.financeCheckoutAttempt.findFirst({
        where: {
          id: attemptId,
          tenantId: actor.tenantId,
          orgId: actor.orgId,
        },
        select: { status: true, stripeCheckoutSessionId: true },
      });
      if (
        !latest ||
        (latest.status === "OPEN" &&
          latest.stripeCheckoutSessionId !== session.id)
      ) {
        throw new ConflictException("Checkout session state changed");
      }
    });
  }

  async markCompleted(
    actor: FinanceAccessScope,
    attemptId: string,
  ): Promise<void> {
    await withTenantRlsContext(actor.tenantId, actor.orgId, (tx) =>
      tx.financeCheckoutAttempt.updateMany({
        where: {
          id: attemptId,
          tenantId: actor.tenantId,
          orgId: actor.orgId,
          status: "OPEN",
        },
        data: { status: "COMPLETED" },
      }),
    );
  }

  async markFailed(
    actor: FinanceAccessScope,
    attemptId: string,
  ): Promise<void> {
    await withTenantRlsContext(actor.tenantId, actor.orgId, (tx) =>
      tx.financeCheckoutAttempt.updateMany({
        where: {
          id: attemptId,
          tenantId: actor.tenantId,
          orgId: actor.orgId,
          status: "CREATING",
        },
        data: { status: "FAILED" },
      }),
    );
  }

  async markExpired(
    actor: FinanceAccessScope,
    attemptId: string,
  ): Promise<void> {
    await withTenantRlsContext(actor.tenantId, actor.orgId, (tx) =>
      tx.financeCheckoutAttempt.updateMany({
        where: {
          id: attemptId,
          tenantId: actor.tenantId,
          orgId: actor.orgId,
          status: { in: ["CREATING", "OPEN"] },
        },
        data: { status: "EXPIRED" },
      }),
    );
  }

  async readView(
    actor: FinanceAccessScope,
    attemptId: string,
  ): Promise<FinanceStripeCheckoutView> {
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      const attempt = await tx.financeCheckoutAttempt.findFirst({
        where: {
          id: attemptId,
          tenantId: actor.tenantId,
          orgId: actor.orgId,
        },
        select: {
          id: true,
          status: true,
          checkoutUrl: true,
          expiresAt: true,
        },
      });
      if (!attempt) throw new NotFoundException("Checkout attempt not found");
      if (
        attempt.status !== "OPEN" ||
        !attempt.checkoutUrl ||
        !attempt.expiresAt
      ) {
        return checkingView(attempt.id);
      }
      return {
        attemptId: attempt.id,
        status: "OPEN",
        checkoutUrl: attempt.checkoutUrl,
        expiresAt: attempt.expiresAt.toISOString(),
      };
    });
  }

  async payerAccountIdForAttempt(
    actor: FinanceAccessScope,
    attemptId: string,
  ): Promise<string> {
    const attempt = await withTenantRlsContext(
      actor.tenantId,
      actor.orgId,
      (tx) =>
        tx.financeCheckoutAttempt.findFirst({
          where: {
            id: attemptId,
            tenantId: actor.tenantId,
            orgId: actor.orgId,
          },
          select: { payerGrant: { select: { financePayerAccountId: true } } },
        }),
    );
    if (!attempt) throw new NotFoundException("Checkout attempt not found");
    return attempt.payerGrant.financePayerAccountId;
  }
}

function checkingView(attemptId: string): FinanceStripeCheckoutView {
  return {
    attemptId,
    status: "CHECKING",
    checkoutUrl: null,
    expiresAt: null,
  };
}
