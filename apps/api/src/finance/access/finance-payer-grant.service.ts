import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Prisma, withTenantRlsContext } from "@pathway/db";
import {
  FINANCE_STRIPE_CHECKOUT_PROVIDER,
  type FinanceStripeCheckoutProvider,
} from "../stripe/finance-stripe-checkout.provider";
import type { FinanceAccessScope } from "./finance-access.reader";

export interface FinancePayerGrantResult {
  id: string;
  payerUserId: string;
  grantedAt: Date;
}

@Injectable()
export class FinancePayerGrantService {
  constructor(
    @Inject(FINANCE_STRIPE_CHECKOUT_PROVIDER)
    private readonly checkoutProvider: FinanceStripeCheckoutProvider,
  ) {}

  async grant(
    scope: FinanceAccessScope,
    payerAccountId: string,
    payerUserId: string,
    grantedByUserId: string,
  ): Promise<FinancePayerGrantResult> {
    try {
      return await withTenantRlsContext(
        scope.tenantId,
        scope.orgId,
        async (tx) => {
          const account = await tx.financePayerAccount.findFirst({
            where: {
              id: payerAccountId,
              tenantId: scope.tenantId,
              orgId: scope.orgId,
            },
            select: { id: true },
          });
          if (!account)
            throw new NotFoundException("Finance account not found");

          const existing = await tx.financePayerGrant.findFirst({
            where: {
              financePayerAccountId: payerAccountId,
              payerUserId,
              tenantId: scope.tenantId,
              orgId: scope.orgId,
              revokedAt: null,
            },
            select: { id: true, payerUserId: true, grantedAt: true },
          });
          if (existing) return existing;

          return tx.financePayerGrant.create({
            data: {
              financePayerAccountId: payerAccountId,
              tenantId: scope.tenantId,
              orgId: scope.orgId,
              payerUserId,
              grantedByUserId,
            },
            select: { id: true, payerUserId: true, grantedAt: true },
          });
        },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictException("Payer access already exists");
      }
      throw error;
    }
  }

  async revoke(
    scope: FinanceAccessScope,
    payerAccountId: string,
    grantId: string,
    revokedByUserId: string,
  ): Promise<void> {
    for (let retry = 0; retry < 3; retry += 1) {
      const openAttempts = await withTenantRlsContext(
        scope.tenantId,
        scope.orgId,
        async (tx) => {
          const account = await tx.financePayerAccount.findFirst({
            where: {
              id: payerAccountId,
              tenantId: scope.tenantId,
              orgId: scope.orgId,
            },
            select: { id: true },
          });
          if (!account)
            throw new NotFoundException("Finance account not found");

          const grant = await tx.financePayerGrant.findFirst({
            where: {
              id: grantId,
              financePayerAccountId: payerAccountId,
              tenantId: scope.tenantId,
              orgId: scope.orgId,
              revokedAt: null,
            },
            select: { id: true },
          });
          if (!grant) {
            throw new NotFoundException("Finance payer grant not found");
          }

          return tx.financeCheckoutAttempt.findMany({
            where: {
              payerGrantId: grantId,
              tenantId: scope.tenantId,
              orgId: scope.orgId,
              status: "OPEN",
              stripeCheckoutSessionId: { not: null },
            },
            select: {
              id: true,
              stripeAccountId: true,
              stripeCheckoutSessionId: true,
            },
          });
        },
      );

      const sessionResolutions = await Promise.all(
        openAttempts.map(async (attempt) => ({
          id: attempt.id,
          status: await this.closeCheckoutSession(attempt),
        })),
      );

      const revoked = await withTenantRlsContext(
        scope.tenantId,
        scope.orgId,
        async (tx) => {
          const lockedGrant = await tx.$queryRaw<Array<{ id: string }>>`
            SELECT "id" FROM "FinancePayerGrant"
            WHERE "id" = ${grantId}
              AND "financePayerAccountId" = ${payerAccountId}
              AND "tenantId" = ${scope.tenantId}
              AND "orgId" = ${scope.orgId}
              AND "revokedAt" IS NULL
            FOR UPDATE
          `;
          if (lockedGrant.length !== 1) {
            throw new NotFoundException("Finance payer grant not found");
          }

          for (const resolution of sessionResolutions) {
            await tx.financeCheckoutAttempt.updateMany({
              where: {
                id: resolution.id,
                tenantId: scope.tenantId,
                orgId: scope.orgId,
                status: "OPEN",
              },
              data: { status: resolution.status },
            });
          }

          const remainingOpenAttempts = await tx.financeCheckoutAttempt.count({
            where: {
              payerGrantId: grantId,
              tenantId: scope.tenantId,
              orgId: scope.orgId,
              status: "OPEN",
            },
          });
          if (remainingOpenAttempts > 0) return false;

          const result = await tx.financePayerGrant.updateMany({
            where: {
              id: grantId,
              financePayerAccountId: payerAccountId,
              tenantId: scope.tenantId,
              orgId: scope.orgId,
              revokedAt: null,
            },
            data: { revokedAt: new Date(), revokedByUserId },
          });
          if (result.count !== 1) {
            throw new NotFoundException("Finance payer grant not found");
          }
          return true;
        },
      );

      if (revoked) return;
    }

    throw new ConflictException(
      "Finance checkout sessions are still active; please retry payer access revocation",
    );
  }

  private async closeCheckoutSession(attempt: {
    id: string;
    stripeAccountId: string;
    stripeCheckoutSessionId: string | null;
  }): Promise<"COMPLETED" | "EXPIRED"> {
    const sessionId = attempt.stripeCheckoutSessionId;
    if (!sessionId) return "EXPIRED";

    try {
      let session = await this.checkoutProvider.retrieveSession({
        stripeAccountId: attempt.stripeAccountId,
        sessionId,
      });
      if (session.status === "open") {
        try {
          await this.checkoutProvider.expireSession({
            stripeAccountId: attempt.stripeAccountId,
            sessionId,
            idempotencyKey: `finance-checkout-expire-${attempt.id}`,
          });
        } catch {
          // Retrieval below determines whether Stripe completed or expired it.
        }
        session = await this.checkoutProvider.retrieveSession({
          stripeAccountId: attempt.stripeAccountId,
          sessionId,
        });
      }
      if (session.status === "open") {
        throw new Error("Stripe Checkout session is still open");
      }
      return session.status === "complete" ? "COMPLETED" : "EXPIRED";
    } catch {
      throw new ServiceUnavailableException(
        "An active Finance payment session could not be secured; payer access was not revoked",
      );
    }
  }
}
