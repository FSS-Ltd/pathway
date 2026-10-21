import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Prisma, withTenantRlsContext } from "@pathway/db";
import { FinanceAccessService } from "../access/finance-access.service";
import type { FinanceAccessScope } from "../access/finance-access.reader";
import { FINANCE_BACS_MANDATE_CONSENT_VERSION } from "../domain/finance-collection-terms";
import {
  FINANCE_STRIPE_CHECKOUT_CONFIG,
  type FinanceStripeCheckoutConfig,
} from "./finance-stripe-checkout.config";
import {
  FINANCE_STRIPE_BACS_PROVIDER,
  type FinanceStripeBacsProvider,
  type FinanceStripeBacsSetupSession,
} from "./finance-stripe-bacs.provider";

export interface FinanceStripeBacsMandateActor extends FinanceAccessScope {
  userId: string;
}

export interface FinanceStripeBacsMandateSetupResult {
  mandateId: string;
  status: "PENDING_SETUP";
  checkoutUrl: string;
  expiresAt: string;
}

export interface FinanceStripeBacsMandateCancellationResult {
  mandateId: string;
  status: "CANCELLED";
  providerCancellation: "CONFIRMED" | "PENDING";
}

type MandateSetupPreparation =
  | {
      kind: "existing";
      mandateId: string;
      checkoutUrl: string;
      expiresAt: Date;
    }
  | {
      kind: "create";
      customerId: string | null;
      customerName: string;
      financeProfileId: string;
      connectionId: string;
      stripeAccountId: string;
      livemode: boolean;
    };

@Injectable()
export class FinanceStripeBacsMandateService {
  constructor(
    @Inject(FinanceAccessService)
    private readonly financeAccess: FinanceAccessService,
    @Inject(FINANCE_STRIPE_CHECKOUT_CONFIG)
    private readonly config: FinanceStripeCheckoutConfig,
    @Inject(FINANCE_STRIPE_BACS_PROVIDER)
    private readonly provider: FinanceStripeBacsProvider,
  ) {}

  async startSetup(
    actor: FinanceStripeBacsMandateActor,
    payerAccountId: string,
  ): Promise<FinanceStripeBacsMandateSetupResult> {
    if (this.config.mode !== "test") {
      throw new ServiceUnavailableException(
        "Finance Bacs collection is available only in the test environment",
      );
    }
    await this.financeAccess.assertPayerAction(
      actor,
      actor.userId,
      payerAccountId,
      "SETUP_MANDATE",
    );

    const setup: MandateSetupPreparation = await withTenantRlsContext(
      actor.tenantId,
      actor.orgId,
      async (tx) => {
        const payer = await tx.financePayerAccount.findFirst({
          where: {
            id: payerAccountId,
            tenantId: actor.tenantId,
            orgId: actor.orgId,
          },
          select: {
            id: true,
            displayName: true,
            financeProfileId: true,
            financeProfile: {
              select: { currency: true, countryCode: true },
            },
          },
        });
        if (!payer)
          throw new NotFoundException("Finance payer account not found");

        await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id" FROM "FinancePayerAccount"
          WHERE "id" = ${payerAccountId}
            AND "tenantId" = ${actor.tenantId}
            AND "orgId" = ${actor.orgId}
          FOR UPDATE
        `;
        await this.lockActivePayerGrant(tx, actor, payerAccountId);

        if (
          payer.financeProfile.countryCode !== "GB" ||
          payer.financeProfile.currency !== "GBP"
        ) {
          throw new ConflictException(
            "Bacs Direct Debit requires a GB school collecting in GBP",
          );
        }

        const connection = await tx.financeStripeConnection.findFirst({
          where: {
            financeProfileId: payer.financeProfileId,
            tenantId: actor.tenantId,
            orgId: actor.orgId,
            status: "READY",
            livemode: this.config.mode === "live",
            stripeAccountId: { not: null },
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: { id: true, stripeAccountId: true, livemode: true },
        });
        if (!connection?.stripeAccountId) {
          throw new ServiceUnavailableException(
            "The school Bacs collection account is not ready",
          );
        }

        const existing = await tx.financeMandate.findFirst({
          where: {
            payerAccountId,
            tenantId: actor.tenantId,
            orgId: actor.orgId,
            status: { in: ["PENDING_SETUP", "ACTIVE", "UNKNOWN"] },
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: {
            id: true,
            status: true,
            checkoutUrl: true,
            setupExpiresAt: true,
            stripeCheckoutSessionId: true,
            stripePaymentMethodId: true,
            stripeAccountId: true,
            stripeConnectionId: true,
          },
        });
        if (existing?.status === "ACTIVE" || existing?.status === "UNKNOWN") {
          throw new ConflictException(
            "This payer account already has a Bacs mandate to review or use",
          );
        }
        if (
          existing?.status === "PENDING_SETUP" &&
          existing.checkoutUrl &&
          existing.setupExpiresAt &&
          existing.setupExpiresAt > new Date() &&
          existing.stripeConnectionId === connection.id &&
          existing.stripeAccountId === connection.stripeAccountId
        ) {
          return {
            kind: "existing" as const,
            mandateId: existing.id,
            checkoutUrl: existing.checkoutUrl,
            expiresAt: existing.setupExpiresAt,
          };
        }
        if (existing?.status === "PENDING_SETUP") {
          await tx.financeMandate.updateMany({
            where: {
              id: existing.id,
              tenantId: actor.tenantId,
              orgId: actor.orgId,
              status: "PENDING_SETUP",
            },
            data: { status: "FAILED" },
          });
        }

        const customer = await tx.financeStripeCustomer.findFirst({
          where: {
            stripeConnectionId: connection.id,
            payerAccountId,
            tenantId: actor.tenantId,
            orgId: actor.orgId,
          },
          select: { id: true, stripeCustomerId: true },
        });
        return {
          kind: "create" as const,
          customerId: customer?.stripeCustomerId ?? null,
          customerName: payer.displayName,
          financeProfileId: payer.financeProfileId,
          connectionId: connection.id,
          stripeAccountId: connection.stripeAccountId,
          livemode: connection.livemode,
        };
      },
    );

    if (setup.kind === "existing") {
      return {
        mandateId: setup.mandateId,
        status: "PENDING_SETUP",
        checkoutUrl: setup.checkoutUrl,
        expiresAt: setup.expiresAt.toISOString(),
      };
    }

    const stripeCustomerId =
      setup.customerId ??
      (
        await this.provider.createCustomer({
          stripeAccountId: setup.stripeAccountId,
          payerAccountId,
          displayName: setup.customerName,
          idempotencyKey: customerIdempotencyKey(
            setup.connectionId,
            payerAccountId,
          ),
        })
      ).id;

    const mandateId = await withTenantRlsContext(
      actor.tenantId,
      actor.orgId,
      async (tx) => {
        await this.financeAccess.assertPayerAction(
          actor,
          actor.userId,
          payerAccountId,
          "SETUP_MANDATE",
        );
        await this.lockActivePayerGrant(tx, actor, payerAccountId);
        const customer = await tx.financeStripeCustomer.upsert({
          where: {
            stripeAccountId_stripeCustomerId: {
              stripeAccountId: setup.stripeAccountId,
              stripeCustomerId: stripeCustomerId,
            },
          },
          create: {
            financeProfileId: setup.financeProfileId,
            stripeConnectionId: setup.connectionId,
            payerAccountId,
            tenantId: actor.tenantId,
            orgId: actor.orgId,
            stripeAccountId: setup.stripeAccountId,
            stripeCustomerId,
            livemode: setup.livemode,
          },
          update: {},
          select: {
            id: true,
            financeProfileId: true,
            stripeConnectionId: true,
            payerAccountId: true,
            tenantId: true,
            orgId: true,
          },
        });
        if (
          customer.financeProfileId !== setup.financeProfileId ||
          customer.stripeConnectionId !== setup.connectionId ||
          customer.payerAccountId !== payerAccountId ||
          customer.tenantId !== actor.tenantId ||
          customer.orgId !== actor.orgId
        ) {
          throw new ConflictException("Stripe payer customer scope changed");
        }

        const pending = await tx.financeMandate.findFirst({
          where: {
            payerAccountId,
            stripeConnectionId: setup.connectionId,
            tenantId: actor.tenantId,
            orgId: actor.orgId,
            status: "PENDING_SETUP",
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: { id: true },
        });
        if (pending) return pending.id;

        const mandate = await tx.financeMandate.create({
          data: {
            financeProfileId: setup.financeProfileId!,
            stripeConnectionId: setup.connectionId,
            payerAccountId,
            financeStripeCustomerId: customer.id,
            tenantId: actor.tenantId,
            orgId: actor.orgId,
            stripeAccountId: setup.stripeAccountId,
            livemode: setup.livemode,
            consentVersion: FINANCE_BACS_MANDATE_CONSENT_VERSION,
            createdByUserId: actor.userId,
          },
          select: { id: true },
        });
        return mandate.id;
      },
    );

    let session: FinanceStripeBacsSetupSession;
    try {
      session = await this.provider.createMandateSetupSession({
        stripeAccountId: setup.stripeAccountId,
        stripeCustomerId,
        mandateId,
        payerAccountId,
        consentVersion: FINANCE_BACS_MANDATE_CONSENT_VERSION,
        idempotencyKey: setupIdempotencyKey(mandateId),
      });
    } catch {
      throw new ServiceUnavailableException(
        "The school Bacs mandate setup could not be started",
      );
    }

    try {
      await withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
        await this.financeAccess.assertPayerAction(
          actor,
          actor.userId,
          payerAccountId,
          "SETUP_MANDATE",
        );
        await this.lockActivePayerGrant(tx, actor, payerAccountId);
        const updated = await tx.financeMandate.updateMany({
          where: {
            id: mandateId,
            payerAccountId,
            tenantId: actor.tenantId,
            orgId: actor.orgId,
            status: "PENDING_SETUP",
          },
          data: {
            stripeCheckoutSessionId: session.id,
            checkoutUrl: session.url,
            setupExpiresAt: session.expiresAt,
          },
        });
        if (updated.count !== 1) {
          throw new ConflictException("Bacs mandate setup is no longer active");
        }
      });
    } catch (error) {
      await this.provider
        .expireMandateSetupSession({
          stripeAccountId: setup.stripeAccountId,
          sessionId: session.id,
          idempotencyKey: `finance-bacs-expire-${mandateId}`,
        })
        .catch(() => undefined);
      if (error instanceof ForbiddenException) throw error;
      throw error;
    }

    return {
      mandateId,
      status: "PENDING_SETUP",
      checkoutUrl: session.url,
      expiresAt: session.expiresAt.toISOString(),
    };
  }

  async cancel(
    actor: FinanceStripeBacsMandateActor,
    payerAccountId: string,
    mandateId: string,
  ): Promise<FinanceStripeBacsMandateCancellationResult> {
    await this.financeAccess.assertPayerAction(
      actor,
      actor.userId,
      payerAccountId,
      "CANCEL_MANDATE",
    );
    const mandate = await withTenantRlsContext(
      actor.tenantId,
      actor.orgId,
      async (tx) => {
        await this.lockActivePayerGrant(tx, actor, payerAccountId);
        await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id" FROM "FinanceMandate"
          WHERE "id" = ${mandateId}
            AND "payerAccountId" = ${payerAccountId}
            AND "tenantId" = ${actor.tenantId}
            AND "orgId" = ${actor.orgId}
          FOR UPDATE
        `;
        const current = await tx.financeMandate.findFirst({
          where: {
            id: mandateId,
            payerAccountId,
            tenantId: actor.tenantId,
            orgId: actor.orgId,
          },
          select: {
            id: true,
            status: true,
            stripeConnectionId: true,
            stripeAccountId: true,
            stripeCheckoutSessionId: true,
            stripePaymentMethodId: true,
            providerCancellationPending: true,
          },
        });
        if (!current) throw new NotFoundException("Bacs mandate not found");
        if (
          current.status === "CANCELLED" &&
          !current.providerCancellationPending
        ) {
          return { ...current, needsProviderCancellation: false };
        }

        const plans = await tx.financeCollectionPlan.findMany({
          where: {
            mandateId,
            tenantId: actor.tenantId,
            orgId: actor.orgId,
            status: {
              in: [
                "PENDING_REVIEW",
                "PENDING_PAYER_ACCEPTANCE",
                "ACTIVE",
                "PAUSED",
              ],
            },
          },
          select: { id: true },
        });
        const now = new Date();
        await tx.financeCollectionPlan.updateMany({
          where: {
            id: { in: plans.map(({ id }) => id) },
            tenantId: actor.tenantId,
            orgId: actor.orgId,
          },
          data: { status: "CANCELLED" },
        });
        for (const plan of plans) {
          await tx.financeCollectionPlanEvent.create({
            data: {
              planId: plan.id,
              tenantId: actor.tenantId,
              orgId: actor.orgId,
              actorUserId: actor.userId,
              type: "CANCELLED",
              details: { reason: "MANDATE_CANCELLED" },
            },
          });
        }
        await tx.financeCollectionInstalment.updateMany({
          where: {
            planId: { in: plans.map(({ id }) => id) },
            tenantId: actor.tenantId,
            orgId: actor.orgId,
            status: { in: ["SCHEDULED", "PAUSED"] },
          },
          data: { status: "CANCELLED" },
        });

        const needsProviderCancellation = Boolean(
          current.stripePaymentMethodId || current.stripeCheckoutSessionId,
        );
        const updated = await tx.financeMandate.update({
          where: { id: mandateId },
          data: {
            status: "CANCELLED",
            cancelledAt: current.status === "CANCELLED" ? undefined : now,
            providerCancellationPending: needsProviderCancellation,
          },
          select: {
            id: true,
            status: true,
            stripeConnectionId: true,
            stripeAccountId: true,
            stripeCheckoutSessionId: true,
            stripePaymentMethodId: true,
            providerCancellationPending: true,
          },
        });
        return {
          ...updated,
          needsProviderCancellation,
        };
      },
    );

    if (!mandate.needsProviderCancellation) {
      return {
        mandateId,
        status: "CANCELLED",
        providerCancellation: mandate.providerCancellationPending
          ? "PENDING"
          : "CONFIRMED",
      };
    }
    if (this.config.mode === "disabled") {
      return {
        mandateId,
        status: "CANCELLED",
        providerCancellation: "PENDING",
      };
    }

    try {
      if (mandate.stripePaymentMethodId) {
        await this.provider.detachPaymentMethod({
          stripeAccountId: mandate.stripeAccountId,
          paymentMethodId: mandate.stripePaymentMethodId,
          idempotencyKey: `finance-bacs-cancel-${mandateId}`,
        });
      } else if (mandate.stripeCheckoutSessionId) {
        await this.provider.expireMandateSetupSession({
          stripeAccountId: mandate.stripeAccountId,
          sessionId: mandate.stripeCheckoutSessionId,
          idempotencyKey: `finance-bacs-expire-${mandateId}`,
        });
      }
      await withTenantRlsContext(actor.tenantId, actor.orgId, (tx) =>
        tx.financeMandate.updateMany({
          where: {
            id: mandateId,
            tenantId: actor.tenantId,
            orgId: actor.orgId,
          },
          data: { providerCancellationPending: false },
        }),
      );
      return {
        mandateId,
        status: "CANCELLED",
        providerCancellation: "CONFIRMED",
      };
    } catch {
      return {
        mandateId,
        status: "CANCELLED",
        providerCancellation: "PENDING",
      };
    }
  }

  private async lockActivePayerGrant(
    tx: Prisma.TransactionClient,
    actor: FinanceStripeBacsMandateActor,
    payerAccountId: string,
  ): Promise<void> {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "FinancePayerGrant"
      WHERE "financePayerAccountId" = ${payerAccountId}
        AND "payerUserId" = ${actor.userId}
        AND "tenantId" = ${actor.tenantId}
        AND "orgId" = ${actor.orgId}
        AND "revokedAt" IS NULL
      FOR UPDATE
    `;
    if (rows.length !== 1) {
      throw new ForbiddenException("Finance access unavailable");
    }
  }
}

function customerIdempotencyKey(
  stripeConnectionId: string,
  payerAccountId: string,
): string {
  return `finance-bacs-customer-${stripeConnectionId}-${payerAccountId}`;
}

function setupIdempotencyKey(mandateId: string): string {
  return `finance-bacs-setup-${mandateId}`;
}
