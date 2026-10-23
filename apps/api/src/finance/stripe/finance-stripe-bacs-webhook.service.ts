import { Inject, Injectable } from "@nestjs/common";
import { Prisma, withTenantRlsContext } from "@pathway/db";
import { FinanceAccessService } from "../access/finance-access.service";
import { FinanceBalanceService } from "../finance-balance.service";
import { lockInvoice } from "../finance-invoice-operations";
import {
  FINANCE_BACS_MANDATE_CONSENT_VERSION,
  FINANCE_BACS_COLLECTION_TERMS_VERSION,
} from "../domain/finance-collection-terms";
import { recordConfirmedStripeReceipt } from "./finance-stripe-receipt";
import {
  FINANCE_STRIPE_MANDATE_SERVICING_PROVIDER,
  type FinanceStripeMandateServicingProvider,
} from "./finance-stripe-mandate-servicing.contracts";
import {
  parseFinanceStripeBacsEvent,
  type FinanceStripeBacsWebhookInput,
} from "./finance-stripe-bacs-webhook.contracts";

const supportedEvents = new Set([
  "setup_intent.succeeded",
  "setup_intent.setup_failed",
  "payment_intent.processing",
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  "payment_intent.canceled",
  "mandate.updated",
  "payment_method.detached",
]);

@Injectable()
export class FinanceStripeBacsWebhookService {
  constructor(
    @Inject(FinanceAccessService)
    private readonly financeAccess: Pick<FinanceAccessService, "resolveMode">,
    @Inject(FinanceBalanceService)
    private readonly balances: FinanceBalanceService,
    @Inject(FINANCE_STRIPE_MANDATE_SERVICING_PROVIDER)
    private readonly provider: Pick<
      FinanceStripeMandateServicingProvider,
      "detachPaymentMethod"
    >,
  ) {}

  supports(eventType: string): boolean {
    return supportedEvents.has(eventType);
  }

  async process(
    input: FinanceStripeBacsWebhookInput,
  ): Promise<"processed" | "deferred"> {
    if (!this.supports(input.eventType)) return "deferred";
    const event = parseFinanceStripeBacsEvent(input);
    switch (event.kind) {
      case "setup_succeeded":
      case "setup_failed":
        return this.processSetupEvent(input, event);
      case "mandate_updated":
      case "payment_method_detached":
        return this.processMandateStatusEvent(input, event);
      case "payment_intent":
        return this.processPaymentIntent(input, event);
    }
  }

  private async processSetupEvent(
    input: FinanceStripeBacsWebhookInput,
    event: Extract<
      ReturnType<typeof parseFinanceStripeBacsEvent>,
      { kind: "setup_succeeded" | "setup_failed" }
    >,
  ): Promise<"processed" | "deferred"> {
    const financeMode = await this.financeAccess.resolveMode(input);
    const result = await withTenantRlsContext(
      input.tenantId,
      input.orgId,
      async (tx) => {
        const findMandate = () =>
          tx.financeMandate.findFirst({
            where: {
              id: event.financeMandateId,
              payerAccountId: event.payerAccountId,
              tenantId: input.tenantId,
              orgId: input.orgId,
            },
            select: {
              id: true,
              status: true,
              financeProfileId: true,
              payerAccountId: true,
              stripeConnectionId: true,
              stripeAccountId: true,
              livemode: true,
              stripeSetupIntentId: true,
              stripePaymentMethodId: true,
              stripeMandateId: true,
              stripeCustomer: {
                select: {
                  stripeCustomerId: true,
                  stripeAccountId: true,
                  stripeConnectionId: true,
                  payerAccountId: true,
                  livemode: true,
                },
              },
              createdByUserId: true,
              consentVersion: true,
              providerStatusAt: true,
              stripeConnection: {
                select: {
                  id: true,
                  stripeAccountId: true,
                  livemode: true,
                  financeProfileId: true,
                },
              },
            },
          });
        let mandate = await findMandate();
        if (!mandate) return { kind: "deferred" as const };
        assertMandateEventScope(mandate, input, event);

        if (event.kind === "setup_failed") {
          await this.lockMandate(tx, input, mandate.id);
          mandate = await findMandate();
          if (!mandate) return { kind: "deferred" as const };
          assertMandateEventScope(mandate, input, event);
          if (
            mandate.providerStatusAt &&
            event.eventCreatedAt <= mandate.providerStatusAt
          ) {
            return { kind: "processed" as const };
          }
          if (
            mandate.status === "PENDING_SETUP" ||
            mandate.status === "UNKNOWN"
          ) {
            await tx.financeMandate.update({
              where: { id: mandate.id },
              data: {
                status: "FAILED",
                stripeSetupIntentId: event.setupIntentId,
                providerStatusAt: event.eventCreatedAt,
              },
            });
          }
          return { kind: "processed" as const };
        }

        const payerGrants = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id" FROM "FinancePayerGrant"
          WHERE "financePayerAccountId" = ${mandate.payerAccountId}
            AND "payerUserId" = ${mandate.createdByUserId}
            AND "tenantId" = ${input.tenantId}
            AND "orgId" = ${input.orgId}
            AND "revokedAt" IS NULL
          FOR UPDATE
        `;
        await this.lockMandate(tx, input, mandate.id);
        mandate = await findMandate();
        if (!mandate) return { kind: "deferred" as const };
        assertMandateEventScope(mandate, input, event);
        const alreadyMatches =
          mandate.stripeSetupIntentId === event.setupIntentId &&
          mandate.stripePaymentMethodId === event.paymentMethodId &&
          mandate.stripeMandateId === event.mandateId &&
          mandate.stripeCustomer.stripeCustomerId === event.customerId;
        if (mandate.status === "ACTIVE" && alreadyMatches) {
          return { kind: "processed" as const };
        }
        if (
          mandate.stripeCustomer.stripeCustomerId !== event.customerId ||
          (mandate.stripeSetupIntentId &&
            mandate.stripeSetupIntentId !== event.setupIntentId) ||
          (mandate.stripePaymentMethodId &&
            mandate.stripePaymentMethodId !== event.paymentMethodId) ||
          (mandate.stripeMandateId &&
            mandate.stripeMandateId !== event.mandateId)
        ) {
          throw new Error(
            "Finance Bacs SetupIntent does not match its mandate",
          );
        }
        if (
          mandate.providerStatusAt &&
          event.eventCreatedAt < mandate.providerStatusAt
        ) {
          return { kind: "processed" as const };
        }
        const canActivate =
          financeMode === "ACTIVE" &&
          !event.livemode &&
          mandate.consentVersion === FINANCE_BACS_MANDATE_CONSENT_VERSION &&
          event.consentVersion === FINANCE_BACS_MANDATE_CONSENT_VERSION &&
          payerGrants.length === 1 &&
          (mandate.status === "PENDING_SETUP" || mandate.status === "UNKNOWN");

        await tx.financeMandate.update({
          where: { id: mandate.id },
          data: {
            status: canActivate ? "ACTIVE" : "CANCELLED",
            stripeSetupIntentId: event.setupIntentId,
            stripePaymentMethodId: event.paymentMethodId,
            stripeMandateId: event.mandateId,
            acceptedAt: canActivate ? event.eventCreatedAt : undefined,
            acceptedByUserId: canActivate ? mandate.createdByUserId : null,
            cancelledAt: canActivate ? null : event.eventCreatedAt,
            providerCancellationPending: !canActivate,
            providerStatusAt: event.eventCreatedAt,
          },
        });
        if (!canActivate) {
          return {
            kind: "cleanup" as const,
            mandateId: mandate.id,
            stripeAccountId: mandate.stripeAccountId,
            paymentMethodId: event.paymentMethodId,
            customerId: mandate.stripeCustomer.stripeCustomerId,
          };
        }
        return { kind: "processed" as const };
      },
    );

    if (result.kind === "deferred") return "deferred";
    if (result.kind === "cleanup") {
      await this.detachMandatePaymentMethod(input, result);
    }
    return "processed";
  }

  private async processMandateStatusEvent(
    input: FinanceStripeBacsWebhookInput,
    event: Extract<
      ReturnType<typeof parseFinanceStripeBacsEvent>,
      { kind: "mandate_updated" | "payment_method_detached" }
    >,
  ): Promise<"processed" | "deferred"> {
    return withTenantRlsContext(input.tenantId, input.orgId, async (tx) => {
      const mandate =
        event.kind === "mandate_updated"
          ? await tx.financeMandate.findFirst({
              where: {
                stripeAccountId: event.accountId,
                stripeMandateId: event.mandateId,
                tenantId: input.tenantId,
                orgId: input.orgId,
              },
              select: { id: true, status: true, providerStatusAt: true },
            })
          : await tx.financeMandate.findFirst({
              where: {
                stripeAccountId: event.accountId,
                stripePaymentMethodId: event.paymentMethodId,
                tenantId: input.tenantId,
                orgId: input.orgId,
              },
              select: { id: true, status: true, providerStatusAt: true },
            });
      if (!mandate) return "deferred";
      await this.lockMandate(tx, input, mandate.id);
      const current = await tx.financeMandate.findFirst({
        where: { id: mandate.id, tenantId: input.tenantId, orgId: input.orgId },
        select: {
          id: true,
          status: true,
          stripeConnectionId: true,
          providerStatusAt: true,
          stripePaymentMethodId: true,
          stripeAccountId: true,
        },
      });
      if (!current) return "deferred";
      if (
        current.providerStatusAt &&
        event.eventCreatedAt <= current.providerStatusAt
      ) {
        return "processed";
      }
      const isInactive =
        event.kind === "payment_method_detached" ||
        (event.kind === "mandate_updated" && event.status === "inactive");
      const status = isInactive ? "CANCELLED" : current.status;
      await tx.financeMandate.update({
        where: { id: current.id },
        data: {
          status,
          cancelledAt: isInactive ? event.eventCreatedAt : undefined,
          providerCancellationPending: isInactive ? false : undefined,
          providerStatusAt: event.eventCreatedAt,
        },
      });
      if (isInactive) {
        await this.cancelPlansForMandate(tx, input, current.id, event.eventId);
      }
      return "processed";
    });
  }

  private async processPaymentIntent(
    input: FinanceStripeBacsWebhookInput,
    event: Extract<
      ReturnType<typeof parseFinanceStripeBacsEvent>,
      { kind: "payment_intent" }
    >,
  ): Promise<"processed" | "deferred"> {
    const scope = { tenantId: input.tenantId, orgId: input.orgId };
    const initial = await withTenantRlsContext(
      input.tenantId,
      input.orgId,
      (tx) =>
        tx.financeDebitAttempt.findFirst({
          where: {
            id: event.debitAttemptId,
            instalmentId: event.instalmentId,
            tenantId: input.tenantId,
            orgId: input.orgId,
          },
          select: {
            id: true,
            instalment: {
              select: { plan: { select: { id: true, invoiceId: true } } },
            },
          },
        }),
    );
    if (!initial) return "deferred";

    return withTenantRlsContext(input.tenantId, input.orgId, async (tx) => {
      await lockInvoice(tx, scope, initial.instalment.plan.invoiceId);
      await this.lockPlan(tx, input, initial.instalment.plan.id);
      await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "FinanceCollectionInstalment"
        WHERE "id" = ${event.instalmentId}
          AND "tenantId" = ${input.tenantId}
          AND "orgId" = ${input.orgId}
        FOR UPDATE
      `;
      await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "FinanceDebitAttempt"
        WHERE "id" = ${event.debitAttemptId}
          AND "tenantId" = ${input.tenantId}
          AND "orgId" = ${input.orgId}
        FOR UPDATE
      `;
      const attempt = await tx.financeDebitAttempt.findFirst({
        where: {
          id: event.debitAttemptId,
          instalmentId: event.instalmentId,
          tenantId: input.tenantId,
          orgId: input.orgId,
        },
        select: debitAttemptSelection,
      });
      if (!attempt) return "deferred";
      assertDebitMatchesEvent(attempt, event, input);
      if (
        attempt.providerStatusAt &&
        event.eventCreatedAt < attempt.providerStatusAt
      ) {
        return "processed";
      }
      if (attempt.status === "SUCCEEDED" && event.status !== "succeeded") {
        return "processed";
      }

      if (event.status === "processing") {
        if (attempt.status === "FAILED" || attempt.status === "CANCELLED") {
          return "processed";
        }
        await tx.financeDebitAttempt.update({
          where: { id: attempt.id },
          data: {
            status: "PROCESSING",
            stripePaymentIntentId: event.paymentIntentId,
            submittedAt: attempt.submittedAt ?? event.eventCreatedAt,
            providerStatusAt: event.eventCreatedAt,
          },
        });
        await tx.financeCollectionInstalment.updateMany({
          where: {
            id: event.instalmentId,
            tenantId: input.tenantId,
            orgId: input.orgId,
            status: { in: ["SCHEDULED", "SUBMISSION_PENDING", "PROCESSING"] },
          },
          data: { status: "PROCESSING" },
        });
        await this.recordPlanEvent(tx, input, attempt.instalment.planId, {
          stripeEventId: event.eventId,
          type: "DEBIT_PROCESSING",
          details: { paymentIntentId: event.paymentIntentId },
        });
        return "processed";
      }

      if (event.status === "succeeded") {
        const invoice = attempt.instalment.plan.invoice;
        if (invoice.status !== "ISSUED" || !invoice.payerAccountId) {
          throw new Error("Finance Bacs debit invoice is no longer issued");
        }
        const before = await this.balances.forInvoices(tx, input, [invoice]);
        const outstandingMinor = BigInt(
          before.get(invoice.id)?.outstandingMinor ?? "0",
        );
        const receipt = await recordConfirmedStripeReceipt(tx, this.balances, {
          tenantId: input.tenantId,
          orgId: input.orgId,
          financeProfileId: attempt.instalment.plan.financeProfileId,
          invoice,
          amountMinor: attempt.amountMinor,
          currency: "GBP",
          source: "STRIPE_BACS",
          sourceReference: event.paymentIntentId,
          confirmedAt: event.eventCreatedAt,
        });
        await tx.financeDebitAttempt.update({
          where: { id: attempt.id },
          data: {
            status: "SUCCEEDED",
            stripePaymentIntentId: event.paymentIntentId,
            submittedAt: attempt.submittedAt ?? event.eventCreatedAt,
            providerStatusAt: event.eventCreatedAt,
          },
        });
        await tx.financeCollectionInstalment.update({
          where: { id: event.instalmentId },
          data: { status: "PAID", paidAt: event.eventCreatedAt },
        });
        await this.recordPlanEvent(tx, input, attempt.instalment.planId, {
          stripeEventId: event.eventId,
          type: "DEBIT_SUCCEEDED",
          details: {
            paymentIntentId: event.paymentIntentId,
            receiptId: receipt.receiptId,
            allocatedMinor: receipt.allocatedMinor.toString(),
            unappliedMinor: receipt.unappliedMinor.toString(),
          },
        });
        const overpayment = outstandingMinor < attempt.amountMinor;
        if (overpayment) {
          await this.pausePlanForReview(
            tx,
            input,
            attempt.instalment.planId,
            event.eventId,
            "CONFIRMED_DEBIT_EXCEEDS_OUTSTANDING",
          );
        } else if (
          attempt.instalment.plan.status !== "CANCELLED" &&
          attempt.instalment.plan.status !== "COMPLETED"
        ) {
          const remaining = await tx.financeCollectionInstalment.count({
            where: {
              planId: attempt.instalment.planId,
              tenantId: input.tenantId,
              orgId: input.orgId,
              status: { notIn: ["PAID", "COVERED", "CANCELLED"] },
            },
          });
          await tx.financeCollectionPlan.update({
            where: { id: attempt.instalment.planId },
            data: {
              status:
                attempt.instalment.plan.status === "PAUSED"
                  ? "PAUSED"
                  : remaining === 0
                    ? "COMPLETED"
                    : "ACTIVE",
            },
          });
        }
        return "processed";
      }

      if (attempt.status !== "SUCCEEDED") {
        await tx.financeDebitAttempt.update({
          where: { id: attempt.id },
          data: {
            status: event.status === "cancelled" ? "CANCELLED" : "FAILED",
            stripePaymentIntentId: event.paymentIntentId,
            submittedAt: attempt.submittedAt ?? event.eventCreatedAt,
            providerStatusAt: event.eventCreatedAt,
          },
        });
        await tx.financeCollectionInstalment.updateMany({
          where: {
            id: event.instalmentId,
            tenantId: input.tenantId,
            orgId: input.orgId,
            status: { notIn: ["PAID", "COVERED", "CANCELLED"] },
          },
          data: { status: "FAILED" },
        });
        await this.pausePlanForReview(
          tx,
          input,
          attempt.instalment.planId,
          event.eventId,
          event.status === "cancelled"
            ? "PROVIDER_CANCELLED_DEBIT"
            : "PROVIDER_FAILED_DEBIT",
          "DEBIT_FAILED",
        );
      }
      return "processed";
    });
  }

  private async pausePlanForReview(
    tx: Prisma.TransactionClient,
    input: FinanceStripeBacsWebhookInput,
    planId: string,
    stripeEventId: string,
    reason: string,
    eventType: "DEBIT_FAILED" | "REVIEW_REQUIRED" = "REVIEW_REQUIRED",
  ): Promise<void> {
    await tx.financeCollectionPlan.updateMany({
      where: {
        id: planId,
        tenantId: input.tenantId,
        orgId: input.orgId,
        status: { in: ["ACTIVE", "PAUSED"] },
      },
      data: { status: "PAUSED" },
    });
    await tx.financeCollectionInstalment.updateMany({
      where: {
        planId,
        tenantId: input.tenantId,
        orgId: input.orgId,
        status: "SCHEDULED",
      },
      data: { status: "PAUSED" },
    });
    await this.recordPlanEvent(tx, input, planId, {
      stripeEventId,
      type: eventType,
      details: { reason },
    });
  }

  private async cancelPlansForMandate(
    tx: Prisma.TransactionClient,
    input: FinanceStripeBacsWebhookInput,
    mandateId: string,
    stripeEventId: string,
  ): Promise<void> {
    const plans = await tx.financeCollectionPlan.findMany({
      where: {
        mandateId,
        tenantId: input.tenantId,
        orgId: input.orgId,
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
    for (const plan of plans) {
      await tx.financeCollectionPlan.update({
        where: { id: plan.id },
        data: { status: "CANCELLED" },
      });
      await tx.financeCollectionInstalment.updateMany({
        where: {
          planId: plan.id,
          tenantId: input.tenantId,
          orgId: input.orgId,
          status: { in: ["SCHEDULED", "PAUSED"] },
        },
        data: { status: "CANCELLED" },
      });
      await this.recordPlanEvent(tx, input, plan.id, {
        stripeEventId,
        type: "CANCELLED",
        details: { reason: "MANDATE_INACTIVE" },
      });
    }
  }

  private async recordPlanEvent(
    tx: Prisma.TransactionClient,
    input: FinanceStripeBacsWebhookInput,
    planId: string,
    event: {
      stripeEventId: string;
      type:
        | "CANCELLED"
        | "DEBIT_PROCESSING"
        | "DEBIT_SUCCEEDED"
        | "DEBIT_FAILED"
        | "REVIEW_REQUIRED";
      details: Prisma.InputJsonValue;
    },
  ): Promise<void> {
    const existing = await tx.financeCollectionPlanEvent.findFirst({
      where: {
        planId,
        stripeEventId: event.stripeEventId,
        tenantId: input.tenantId,
        orgId: input.orgId,
      },
      select: { id: true },
    });
    if (existing) return;
    await tx.financeCollectionPlanEvent.create({
      data: {
        planId,
        tenantId: input.tenantId,
        orgId: input.orgId,
        stripeEventId: event.stripeEventId,
        actorUserId: null,
        type: event.type,
        details: event.details,
      },
    });
  }

  private async lockMandate(
    tx: Prisma.TransactionClient,
    input: FinanceStripeBacsWebhookInput,
    mandateId: string,
  ): Promise<void> {
    await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "FinanceMandate"
      WHERE "id" = ${mandateId}
        AND "tenantId" = ${input.tenantId}
        AND "orgId" = ${input.orgId}
      FOR UPDATE
    `;
  }

  private async lockPlan(
    tx: Prisma.TransactionClient,
    input: FinanceStripeBacsWebhookInput,
    planId: string,
  ): Promise<void> {
    await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "FinanceCollectionPlan"
      WHERE "id" = ${planId}
        AND "tenantId" = ${input.tenantId}
        AND "orgId" = ${input.orgId}
      FOR UPDATE
    `;
  }

  private async detachMandatePaymentMethod(
    input: FinanceStripeBacsWebhookInput,
    target: {
      mandateId: string;
      stripeAccountId: string;
      paymentMethodId: string;
      customerId: string;
    },
  ): Promise<void> {
    try {
      await this.provider.detachPaymentMethod({
        stripeAccountId: target.stripeAccountId,
        livemode: input.livemode,
        customerId: target.customerId,
        paymentMethodId: target.paymentMethodId,
        idempotencyKey: `finance-bacs-revoked-${target.mandateId}`,
      });
      await withTenantRlsContext(input.tenantId, input.orgId, (tx) =>
        tx.financeMandate.updateMany({
          where: {
            id: target.mandateId,
            tenantId: input.tenantId,
            orgId: input.orgId,
          },
          data: { providerCancellationPending: false },
        }),
      );
    } catch {
      // Retain providerCancellationPending so the cancellation can be retried.
    }
  }
}

const debitAttemptSelection = {
  id: true,
  instalmentId: true,
  stripeConnectionId: true,
  stripeAccountId: true,
  amountMinor: true,
  currency: true,
  status: true,
  stripePaymentIntentId: true,
  submittedAt: true,
  providerStatusAt: true,
  stripeConnection: {
    select: { stripeAccountId: true, livemode: true, financeProfileId: true },
  },
  instalment: {
    select: {
      id: true,
      amountMinor: true,
      planId: true,
      status: true,
      plan: {
        select: {
          id: true,
          status: true,
          financeProfileId: true,
          stripeConnectionId: true,
          payerAccountId: true,
          invoiceId: true,
          mandateId: true,
          currency: true,
          consentVersion: true,
          mandate: {
            select: {
              status: true,
              stripeConnectionId: true,
              livemode: true,
              stripeAccountId: true,
              stripeMandateId: true,
              stripePaymentMethodId: true,
              stripeCustomer: {
                select: {
                  stripeCustomerId: true,
                  stripeAccountId: true,
                  stripeConnectionId: true,
                  payerAccountId: true,
                  livemode: true,
                },
              },
            },
          },
          invoice: {
            select: {
              id: true,
              financeProfileId: true,
              payerAccountId: true,
              status: true,
              currency: true,
              totalMinor: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.FinanceDebitAttemptSelect;

type SelectedDebitAttempt = Prisma.FinanceDebitAttemptGetPayload<{
  select: typeof debitAttemptSelection;
}>;

function assertMandateEventScope(
  mandate: {
    id: string;
    payerAccountId: string;
    financeProfileId: string;
    createdByUserId: string;
    stripeAccountId: string;
    livemode: boolean;
    consentVersion: string;
    stripeConnectionId: string;
    stripeCustomer: {
      stripeAccountId: string;
      stripeConnectionId: string;
      payerAccountId: string;
      livemode: boolean;
    };
    stripeConnection: {
      id: string;
      stripeAccountId: string | null;
      livemode: boolean;
      financeProfileId: string;
    };
  },
  input: FinanceStripeBacsWebhookInput,
  event: {
    accountId: string;
    livemode: boolean;
    payerAccountId: string;
    consentVersion: string;
  },
): void {
  if (
    mandate.stripeAccountId !== event.accountId ||
    mandate.stripeConnection.stripeAccountId !== event.accountId ||
    mandate.livemode !== event.livemode ||
    mandate.stripeConnection.livemode !== event.livemode ||
    mandate.payerAccountId !== event.payerAccountId ||
    mandate.stripeConnectionId !== mandate.stripeConnection.id ||
    mandate.stripeCustomer.stripeAccountId !== event.accountId ||
    mandate.stripeCustomer.stripeConnectionId !== mandate.stripeConnectionId ||
    mandate.stripeCustomer.payerAccountId !== mandate.payerAccountId ||
    mandate.stripeCustomer.livemode !== event.livemode ||
    mandate.stripeConnection.financeProfileId !== mandate.financeProfileId ||
    mandate.consentVersion !== event.consentVersion ||
    input.stripeAccountId !== event.accountId
  ) {
    throw new Error(
      "Finance Bacs setup event does not match its mandate scope",
    );
  }
}

function assertDebitMatchesEvent(
  attempt: SelectedDebitAttempt,
  event: Extract<
    ReturnType<typeof parseFinanceStripeBacsEvent>,
    { kind: "payment_intent" }
  >,
  input: FinanceStripeBacsWebhookInput,
): void {
  const plan = attempt.instalment.plan;
  const mandate = plan.mandate;
  if (
    attempt.id !== event.debitAttemptId ||
    attempt.instalmentId !== event.instalmentId ||
    attempt.amountMinor !== event.amountMinor ||
    attempt.instalment.amountMinor !== attempt.amountMinor ||
    attempt.currency !== "GBP" ||
    event.currency !== "GBP" ||
    attempt.stripeAccountId !== event.accountId ||
    attempt.stripeConnection.stripeAccountId !== event.accountId ||
    attempt.stripeConnection.livemode !== event.livemode ||
    plan.currency !== "GBP" ||
    plan.consentVersion !== FINANCE_BACS_COLLECTION_TERMS_VERSION ||
    plan.invoice.status !== "ISSUED" ||
    plan.invoice.currency !== "GBP" ||
    plan.invoice.financeProfileId !== plan.financeProfileId ||
    plan.invoice.payerAccountId !== plan.payerAccountId ||
    attempt.stripeConnectionId !== plan.stripeConnectionId ||
    mandate.stripeConnectionId !== plan.stripeConnectionId ||
    mandate.stripeAccountId !== event.accountId ||
    mandate.livemode !== event.livemode ||
    mandate.stripeCustomer.stripeCustomerId !== event.customerId ||
    mandate.stripeCustomer.stripeAccountId !== event.accountId ||
    mandate.stripeCustomer.stripeConnectionId !== plan.stripeConnectionId ||
    mandate.stripeCustomer.payerAccountId !== plan.payerAccountId ||
    mandate.stripeCustomer.livemode !== event.livemode ||
    mandate.stripePaymentMethodId !== event.paymentMethodId ||
    attempt.stripeConnection.financeProfileId !== plan.financeProfileId ||
    input.stripeAccountId !== event.accountId ||
    (attempt.stripePaymentIntentId !== null &&
      attempt.stripePaymentIntentId !== event.paymentIntentId)
  ) {
    throw new Error(
      "Finance Bacs PaymentIntent does not match its attempt facts",
    );
  }
}
