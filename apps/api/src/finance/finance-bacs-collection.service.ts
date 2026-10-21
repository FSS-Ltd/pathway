import { randomUUID } from "node:crypto";
import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  Module as OrgModule,
  Prisma,
  runTransaction,
  withTenantRlsContext,
} from "@pathway/db";
import { FinanceAccessService } from "./access/finance-access.service";
import type { FinanceAccessScope } from "./access/finance-access.reader";
import { FinanceBalanceService } from "./finance-balance.service";
import {
  FINANCE_BACS_COLLECTION_TERMS_VERSION,
  FINANCE_BACS_MANDATE_CONSENT_VERSION,
} from "./domain/finance-collection-terms";
import { lockInvoice } from "./finance-invoice-operations";
import { FinanceRecurringInvoiceService } from "./finance-recurring-invoice.service";
import {
  FINANCE_STRIPE_CHECKOUT_CONFIG,
  type FinanceStripeCheckoutConfig,
} from "./stripe/finance-stripe-checkout.config";
import {
  FinanceStripeBacsProviderError,
  FINANCE_STRIPE_BACS_PROVIDER,
  type FinanceStripeBacsPaymentIntent,
  type FinanceStripeBacsProvider,
} from "./stripe/finance-stripe-bacs.provider";

type DueFinanceScope = FinanceAccessScope;

interface DebitSubmission {
  attemptId: string;
  installmentId: string;
  planId: string;
  stripeAccountId: string;
  stripeCustomerId: string;
  paymentMethodId: string;
  amountMinor: bigint;
  idempotencyKey: string;
}

@Injectable()
export class FinanceBacsCollectionService {
  constructor(
    @Inject(FinanceAccessService)
    private readonly financeAccess: FinanceAccessService,
    @Inject(FinanceBalanceService)
    private readonly balances: FinanceBalanceService,
    @Inject(FinanceRecurringInvoiceService)
    private readonly recurringInvoices: FinanceRecurringInvoiceService,
    @Inject(FINANCE_STRIPE_CHECKOUT_CONFIG)
    private readonly config: FinanceStripeCheckoutConfig,
    @Inject(FINANCE_STRIPE_BACS_PROVIDER)
    private readonly provider: FinanceStripeBacsProvider,
  ) {}

  async runDue(asOf = new Date()): Promise<{
    scopes: number;
    invoicesGenerated: number;
    debitsSubmitted: number;
    debitsPending: number;
    debitsFailed: number;
  }> {
    if (this.config.mode !== "test") {
      throw new ServiceUnavailableException(
        "Automated Bacs collection is available only in the test environment",
      );
    }
    const scopes = await runTransaction(
      (tx) =>
        tx.$queryRaw<Array<DueFinanceScope>>`
        SELECT * FROM app.list_due_finance_collection_scopes(${asOf})
      `,
    );
    let invoicesGenerated = 0;
    let debitsSubmitted = 0;
    let debitsPending = 0;
    let debitsFailed = 0;

    for (const scope of scopes) {
      if ((await this.financeAccess.resolveMode(scope)) !== "ACTIVE") continue;
      const invoiceBatch = await this.recurringInvoices.generateDueForScope(
        scope,
        asOf,
      );
      invoicesGenerated += invoiceBatch.generated;
      const result = await this.submitDueForScope(scope, asOf);
      debitsSubmitted += result.submitted;
      debitsPending += result.pending;
      debitsFailed += result.failed;
    }
    return {
      scopes: scopes.length,
      invoicesGenerated,
      debitsSubmitted,
      debitsPending,
      debitsFailed,
    };
  }

  private async submitDueForScope(
    scope: DueFinanceScope,
    asOf: Date,
  ): Promise<{ submitted: number; pending: number; failed: number }> {
    const asOfDate = londonDateOnly(asOf);
    const due = await withTenantRlsContext(scope.tenantId, scope.orgId, (tx) =>
      tx.financeCollectionInstalment.findMany({
        where: {
          tenantId: scope.tenantId,
          orgId: scope.orgId,
          dueAt: { lte: dateOnlyAsUtc(asOfDate) },
          status: { in: ["SCHEDULED", "SUBMISSION_PENDING"] },
          plan: { is: { status: "ACTIVE" } },
        },
        select: { id: true },
        orderBy: [{ dueAt: "asc" }, { sequence: "asc" }, { id: "asc" }],
      }),
    );
    let submitted = 0;
    let pending = 0;
    let failed = 0;
    for (const installment of due) {
      const work = await this.prepareSubmission(scope, installment.id, asOf);
      if (!work) continue;
      const result = await this.submit(work, scope);
      if (result === "submitted") submitted += 1;
      if (result === "pending") pending += 1;
      if (result === "failed") failed += 1;
    }
    return { submitted, pending, failed };
  }

  private async prepareSubmission(
    scope: DueFinanceScope,
    installmentId: string,
    asOf: Date,
  ): Promise<DebitSubmission | null> {
    const initial = await withTenantRlsContext(
      scope.tenantId,
      scope.orgId,
      (tx) =>
        tx.financeCollectionInstalment.findFirst({
          where: {
            id: installmentId,
            tenantId: scope.tenantId,
            orgId: scope.orgId,
          },
          select: {
            plan: {
              select: {
                id: true,
                invoiceId: true,
                payerAccountId: true,
                acceptedByUserId: true,
              },
            },
          },
        }),
    );
    if (!initial) return null;

    return withTenantRlsContext(scope.tenantId, scope.orgId, async (tx) => {
      const payerGrants = initial.plan.acceptedByUserId
        ? await tx.$queryRaw<Array<{ id: string }>>`
            SELECT "id" FROM "FinancePayerGrant"
            WHERE "financePayerAccountId" = ${initial.plan.payerAccountId}
              AND "payerUserId" = ${initial.plan.acceptedByUserId}
              AND "tenantId" = ${scope.tenantId}
              AND "orgId" = ${scope.orgId}
              AND "revokedAt" IS NULL
            FOR UPDATE
          `
        : [];
      await lockInvoice(tx, scope, initial.plan.invoiceId);
      await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "FinanceCollectionPlan"
        WHERE "id" = ${initial.plan.id}
          AND "tenantId" = ${scope.tenantId}
          AND "orgId" = ${scope.orgId}
        FOR UPDATE
      `;
      await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "FinanceCollectionInstalment"
        WHERE "id" = ${installmentId}
          AND "tenantId" = ${scope.tenantId}
          AND "orgId" = ${scope.orgId}
        FOR UPDATE
      `;
      const [entitlement, installment] = await Promise.all([
        tx.orgModule.findUnique({
          where: {
            orgId_module: { orgId: scope.orgId, module: OrgModule.FINANCE },
          },
          select: { status: true, expiresAt: true },
        }),
        tx.financeCollectionInstalment.findFirst({
          where: {
            id: installmentId,
            tenantId: scope.tenantId,
            orgId: scope.orgId,
          },
          select: debitScheduleSelection,
        }),
      ]);
      if (!installment) return null;
      if (
        entitlement?.status !== "ACTIVE" ||
        (entitlement.expiresAt !== null && entitlement.expiresAt <= asOf)
      ) {
        await this.pausePlanForReview(
          tx,
          scope,
          installment.plan.id,
          "FINANCE_ACCESS_SERVICING",
        );
        return null;
      }
      const plan = installment.plan;
      if (
        plan.status !== "ACTIVE" ||
        plan.consentVersion !== FINANCE_BACS_COLLECTION_TERMS_VERSION ||
        plan.mandate.status !== "ACTIVE" ||
        plan.mandate.consentVersion !== FINANCE_BACS_MANDATE_CONSENT_VERSION ||
        !plan.mandate.stripePaymentMethodId ||
        plan.mandate.livemode ||
        plan.mandate.stripeConnectionId !== plan.stripeConnectionId ||
        plan.mandate.stripeAccountId !==
          plan.stripeConnection.stripeAccountId ||
        plan.mandate.stripeCustomer.stripeAccountId !==
          plan.stripeConnection.stripeAccountId ||
        plan.mandate.stripeCustomer.stripeConnectionId !==
          plan.stripeConnectionId ||
        plan.mandate.stripeCustomer.payerAccountId !== plan.payerAccountId ||
        plan.mandate.stripeCustomer.livemode ||
        plan.stripeConnection.status !== "READY" ||
        plan.stripeConnection.livemode ||
        !plan.stripeConnection.stripeAccountId ||
        plan.stripeConnection.id !== plan.stripeConnectionId ||
        plan.financeProfile.countryCode !== "GB" ||
        plan.financeProfile.currency !== "GBP" ||
        plan.invoice.status !== "ISSUED" ||
        plan.invoice.currency !== "GBP" ||
        plan.invoice.financeProfileId !== plan.financeProfileId ||
        plan.invoice.payerAccountId !== plan.payerAccountId ||
        !plan.acceptedByUserId
      ) {
        await this.pausePlanForReview(
          tx,
          scope,
          plan.id,
          "COLLECTION_SCOPE_CHANGED",
        );
        return null;
      }

      if (payerGrants.length !== 1) {
        await this.pausePlanForReview(
          tx,
          scope,
          plan.id,
          "PAYER_GRANT_REVOKED",
        );
        return null;
      }

      const currentBalance = await this.balances.forInvoices(tx, scope, [
        plan.invoice,
      ]);
      const outstanding = BigInt(
        currentBalance.get(plan.invoice.id)?.outstandingMinor ?? "0",
      );
      const schedule = await tx.financeCollectionInstalment.findMany({
        where: {
          planId: plan.id,
          tenantId: scope.tenantId,
          orgId: scope.orgId,
          status: {
            in: ["SCHEDULED", "SUBMISSION_PENDING", "PROCESSING", "PAUSED"],
          },
        },
        select: { id: true, sequence: true, amountMinor: true, status: true },
        orderBy: [{ sequence: "asc" }, { id: "asc" }],
      });
      let expectedRemaining = schedule.reduce(
        (sum, row) => sum + row.amountMinor,
        0n,
      );
      if (outstanding === 0n) {
        await tx.financeCollectionInstalment.updateMany({
          where: {
            planId: plan.id,
            tenantId: scope.tenantId,
            orgId: scope.orgId,
            status: "SCHEDULED",
          },
          data: { status: "COVERED" },
        });
        const inFlight = schedule.some((row) =>
          ["SUBMISSION_PENDING", "PROCESSING"].includes(row.status),
        );
        if (inFlight) {
          await this.pausePlanForReview(
            tx,
            scope,
            plan.id,
            "MANUAL_PAYMENT_WHILE_DEBIT_IN_FLIGHT",
          );
        } else {
          await tx.financeCollectionPlan.update({
            where: { id: plan.id },
            data: { status: "COMPLETED" },
          });
        }
        await tx.financeCollectionPlanEvent.create({
          data: {
            planId: plan.id,
            tenantId: scope.tenantId,
            orgId: scope.orgId,
            type: "MANUAL_PAYMENT_COVERED",
            details: { reason: "INVOICE_SETTLED_BEFORE_DEBIT" },
          },
        });
        return null;
      }
      if (outstanding < expectedRemaining) {
        let remainingReduction = expectedRemaining - outstanding;
        for (const row of schedule) {
          if (remainingReduction === 0n) break;
          if (
            row.status !== "SCHEDULED" ||
            row.amountMinor > remainingReduction
          ) {
            break;
          }
          await tx.financeCollectionInstalment.update({
            where: { id: row.id },
            data: { status: "COVERED" },
          });
          remainingReduction -= row.amountMinor;
          expectedRemaining -= row.amountMinor;
          await tx.financeCollectionPlanEvent.create({
            data: {
              planId: plan.id,
              tenantId: scope.tenantId,
              orgId: scope.orgId,
              type: "MANUAL_PAYMENT_COVERED",
              details: {
                installmentId: row.id,
                sequence: row.sequence,
                amountMinor: row.amountMinor.toString(),
              },
            },
          });
        }
        if (remainingReduction !== 0n) {
          await this.pausePlanForReview(
            tx,
            scope,
            plan.id,
            "MANUAL_BALANCE_REQUIRES_REVIEW",
          );
          return null;
        }
      }
      if (outstanding !== expectedRemaining) {
        await this.pausePlanForReview(
          tx,
          scope,
          plan.id,
          "PLAN_BALANCE_MISMATCH",
        );
        return null;
      }
      const currentInstallment = schedule.find(
        (row) => row.id === installmentId,
      );
      if (
        !currentInstallment ||
        !["SCHEDULED", "SUBMISSION_PENDING"].includes(currentInstallment.status)
      ) {
        return null;
      }
      if (
        currentInstallment.status === "SCHEDULED" &&
        currentInstallment.amountMinor > outstanding
      ) {
        await this.pausePlanForReview(
          tx,
          scope,
          plan.id,
          "INSTALMENT_EXCEEDS_OUTSTANDING",
        );
        return null;
      }

      const existingAttempt = await tx.financeDebitAttempt.findFirst({
        where: {
          instalmentId: installmentId,
          tenantId: scope.tenantId,
          orgId: scope.orgId,
        },
        select: {
          id: true,
          status: true,
          stripePaymentIntentId: true,
          idempotencyKey: true,
        },
      });
      if (existingAttempt) {
        if (
          [
            "SUBMITTED",
            "PROCESSING",
            "SUCCEEDED",
            "FAILED",
            "CANCELLED",
          ].includes(existingAttempt.status) ||
          existingAttempt.stripePaymentIntentId
        ) {
          return null;
        }
        if (!["CREATING", "UNKNOWN"].includes(existingAttempt.status)) {
          return null;
        }
        return {
          attemptId: existingAttempt.id,
          installmentId,
          planId: plan.id,
          stripeAccountId: plan.stripeConnection.stripeAccountId,
          stripeCustomerId: plan.mandate.stripeCustomer.stripeCustomerId,
          paymentMethodId: plan.mandate.stripePaymentMethodId,
          amountMinor: installment.amountMinor,
          idempotencyKey: existingAttempt.idempotencyKey,
        };
      }

      const attemptId = randomUUID();
      const idempotencyKey = `finance-bacs-debit-${attemptId}`;
      await tx.financeDebitAttempt.create({
        data: {
          id: attemptId,
          instalmentId: installmentId,
          stripeConnectionId: plan.stripeConnectionId,
          tenantId: scope.tenantId,
          orgId: scope.orgId,
          stripeAccountId: plan.stripeConnection.stripeAccountId,
          amountMinor: installment.amountMinor,
          currency: "GBP",
          status: "CREATING",
          idempotencyKey,
        },
      });
      await tx.financeCollectionInstalment.updateMany({
        where: {
          id: installmentId,
          tenantId: scope.tenantId,
          orgId: scope.orgId,
          status: "SCHEDULED",
        },
        data: { status: "SUBMISSION_PENDING" },
      });
      return {
        attemptId,
        installmentId,
        planId: plan.id,
        stripeAccountId: plan.stripeConnection.stripeAccountId,
        stripeCustomerId: plan.mandate.stripeCustomer.stripeCustomerId,
        paymentMethodId: plan.mandate.stripePaymentMethodId,
        amountMinor: installment.amountMinor,
        idempotencyKey,
      };
    });
  }

  private async submit(
    work: DebitSubmission,
    scope: DueFinanceScope,
  ): Promise<"submitted" | "pending" | "failed"> {
    let response: FinanceStripeBacsPaymentIntent;
    try {
      response = await this.provider.createDebit({
        stripeAccountId: work.stripeAccountId,
        customerId: work.stripeCustomerId,
        paymentMethodId: work.paymentMethodId,
        debitAttemptId: work.attemptId,
        instalmentId: work.installmentId,
        amountMinor: work.amountMinor,
        idempotencyKey: work.idempotencyKey,
      });
    } catch (error) {
      if (error instanceof FinanceStripeBacsProviderError && error.retryable) {
        await this.markAttemptUnknown(scope, work);
        return "pending";
      }
      await this.markAttemptFailed(scope, work, "PROVIDER_REQUEST_FAILED");
      return "failed";
    }

    if (response.status === "processing" || response.status === "succeeded") {
      await withTenantRlsContext(scope.tenantId, scope.orgId, (tx) =>
        tx.financeDebitAttempt.updateMany({
          where: {
            id: work.attemptId,
            tenantId: scope.tenantId,
            orgId: scope.orgId,
            status: { in: ["CREATING", "UNKNOWN"] },
            providerStatusAt: null,
          },
          data: {
            status: "SUBMITTED",
            stripePaymentIntentId: response.id,
            submittedAt: new Date(),
          },
        }),
      );
      return "submitted";
    }
    if (
      response.status === "requires_payment_method" ||
      response.status === "canceled"
    ) {
      await this.markAttemptFailed(scope, work, "PROVIDER_REJECTED_DEBIT");
      return "failed";
    }

    await withTenantRlsContext(scope.tenantId, scope.orgId, async (tx) => {
      await tx.financeDebitAttempt.updateMany({
        where: {
          id: work.attemptId,
          tenantId: scope.tenantId,
          orgId: scope.orgId,
          status: { in: ["CREATING", "UNKNOWN"] },
          providerStatusAt: null,
        },
        data: {
          status: "UNKNOWN",
          stripePaymentIntentId: response.id,
          submittedAt: new Date(),
        },
      });
      await this.pausePlanForReview(
        tx,
        scope,
        work.planId,
        "PROVIDER_STATUS_REQUIRES_REVIEW",
      );
    });
    return "pending";
  }

  private async markAttemptUnknown(
    scope: DueFinanceScope,
    work: DebitSubmission,
  ): Promise<void> {
    await withTenantRlsContext(scope.tenantId, scope.orgId, (tx) =>
      tx.financeDebitAttempt.updateMany({
        where: {
          id: work.attemptId,
          tenantId: scope.tenantId,
          orgId: scope.orgId,
          status: { in: ["CREATING", "UNKNOWN"] },
          providerStatusAt: null,
        },
        data: { status: "UNKNOWN" },
      }),
    );
  }

  private async markAttemptFailed(
    scope: DueFinanceScope,
    work: DebitSubmission,
    reason: string,
  ): Promise<void> {
    await withTenantRlsContext(scope.tenantId, scope.orgId, async (tx) => {
      await tx.financeDebitAttempt.updateMany({
        where: {
          id: work.attemptId,
          tenantId: scope.tenantId,
          orgId: scope.orgId,
          status: { in: ["CREATING", "UNKNOWN"] },
          providerStatusAt: null,
        },
        data: { status: "FAILED", submittedAt: new Date() },
      });
      await tx.financeCollectionInstalment.updateMany({
        where: {
          id: work.installmentId,
          tenantId: scope.tenantId,
          orgId: scope.orgId,
          status: "SUBMISSION_PENDING",
        },
        data: { status: "FAILED" },
      });
      await this.pausePlanForReview(
        tx,
        scope,
        work.planId,
        reason,
        "DEBIT_FAILED",
      );
    });
  }

  private async pausePlanForReview(
    tx: Prisma.TransactionClient,
    scope: DueFinanceScope,
    planId: string,
    reason: string,
    eventType: "REVIEW_REQUIRED" | "DEBIT_FAILED" = "REVIEW_REQUIRED",
  ): Promise<void> {
    const changed = await tx.financeCollectionPlan.updateMany({
      where: {
        id: planId,
        tenantId: scope.tenantId,
        orgId: scope.orgId,
        status: "ACTIVE",
      },
      data: { status: "PAUSED" },
    });
    if (changed.count !== 1) return;
    await tx.financeCollectionInstalment.updateMany({
      where: {
        planId,
        tenantId: scope.tenantId,
        orgId: scope.orgId,
        status: "SCHEDULED",
      },
      data: { status: "PAUSED" },
    });
    await tx.financeCollectionPlanEvent.create({
      data: {
        planId,
        tenantId: scope.tenantId,
        orgId: scope.orgId,
        type: eventType,
        details: { reason },
      },
    });
  }
}

const debitScheduleSelection = {
  id: true,
  amountMinor: true,
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
      amountMinor: true,
      currency: true,
      consentVersion: true,
      acceptedByUserId: true,
      stripeConnection: {
        select: {
          id: true,
          financeProfileId: true,
          stripeAccountId: true,
          livemode: true,
          status: true,
        },
      },
      financeProfile: { select: { countryCode: true, currency: true } },
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
      mandate: {
        select: {
          status: true,
          stripeConnectionId: true,
          stripeAccountId: true,
          livemode: true,
          consentVersion: true,
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
    },
  },
} satisfies Prisma.FinanceCollectionInstalmentSelect;

function dateOnlyAsUtc(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new Error("Finance collection date is invalid");
  }
  return date;
}

function londonDateOnly(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
