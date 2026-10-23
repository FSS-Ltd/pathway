import { randomUUID } from "node:crypto";
import type { Prisma } from "@pathway/db";
import {
  FINANCE_BACS_COLLECTION_TERMS_VERSION,
  FINANCE_BACS_MANDATE_CONSENT_VERSION,
} from "../../domain/finance-collection-terms";
import type { FinanceConnectionScope } from "../finance-reconciliation.types";
import type { FinanceReconciliationObject } from "../../stripe/finance-stripe-reconciliation.provider";
import { withReconciliationOperation } from "./finance-reconciliation-operation.fixture";

interface DebitFixture {
  tx: Prisma.TransactionClient;
  scope: FinanceConnectionScope;
  paymentIntent: FinanceReconciliationObject;
  attemptId: string;
  invoiceId: string;
  mandateId: string;
  payerAccountId: string;
  payerUserId: string;
}

export async function withReconciliationDebit(
  check: (fixture: DebitFixture) => Promise<void>,
): Promise<void> {
  await withReconciliationOperation(
    async ({ tx, scope, invoiceId, grantId }) => {
      const invoice = await tx.financeInvoice.findUniqueOrThrow({
        where: { id: invoiceId },
      });
      const grant = await tx.financePayerGrant.findUniqueOrThrow({
        where: { id: grantId },
      });
      if (!invoice.payerAccountId || !invoice.createdByUserId)
        throw new Error("Missing synthetic debit fixture actor/payer");
      const account = {
        financeProfileId: invoice.financeProfileId,
        payerAccountId: invoice.payerAccountId,
        stripeConnectionId: scope.connectionId,
        stripeAccountId: scope.stripeAccountId,
        tenantId: scope.tenantId,
        orgId: scope.orgId,
      };
      const customer = await tx.financeStripeCustomer.create({
        data: {
          ...account,
          stripeCustomerId: `cus_${randomUUID().replaceAll("-", "")}`,
          livemode: false,
        },
      });
      const mandate = await tx.financeMandate.create({
        data: {
          ...account,
          financeStripeCustomerId: customer.id,
          livemode: false,
          status: "ACTIVE",
          createdByUserId: grant.payerUserId,
          acceptedByUserId: grant.payerUserId,
          acceptedAt: new Date(),
          consentVersion: FINANCE_BACS_MANDATE_CONSENT_VERSION,
          stripeSetupIntentId: `seti_${randomUUID().replaceAll("-", "")}`,
          stripePaymentMethodId: `pm_${randomUUID().replaceAll("-", "")}`,
          stripeMandateId: `mandate_${randomUUID().replaceAll("-", "")}`,
        },
      });
      const reviewer = await tx.user.create({
        data: { email: `${randomUUID()}@example.test` },
      });
      const plan = await tx.financeCollectionPlan.create({
        data: {
          financeProfileId: invoice.financeProfileId,
          payerAccountId: invoice.payerAccountId,
          stripeConnectionId: scope.connectionId,
          tenantId: scope.tenantId,
          orgId: scope.orgId,
          invoiceId,
          mandateId: mandate.id,
          status: "ACTIVE",
          amountMinor: 2450n,
          currency: "GBP",
          instalmentCount: 1,
          firstDueAt: new Date(),
          dayOfMonth: 23,
          consentVersion: FINANCE_BACS_COLLECTION_TERMS_VERSION,
          createdByUserId: invoice.createdByUserId,
          approvedByUserId: reviewer.id,
          approvedAt: new Date(),
          acceptedByUserId: grant.payerUserId,
          acceptedAt: new Date(),
        },
      });
      const instalment = await tx.financeCollectionInstalment.create({
        data: {
          planId: plan.id,
          tenantId: scope.tenantId,
          orgId: scope.orgId,
          sequence: 1,
          amountMinor: 2450n,
          dueAt: new Date(),
          status: "SUBMISSION_PENDING",
        },
      });
      const attempt = await tx.financeDebitAttempt.create({
        data: {
          instalmentId: instalment.id,
          stripeConnectionId: scope.connectionId,
          stripeAccountId: scope.stripeAccountId,
          tenantId: scope.tenantId,
          orgId: scope.orgId,
          amountMinor: 2450n,
          currency: "GBP",
          idempotencyKey: randomUUID(),
        },
      });
      const paymentIntent: FinanceReconciliationObject = {
        id: `pi_${randomUUID().replaceAll("-", "")}`,
        object: "payment_intent",
        created: Math.floor(Date.now() / 1000),
        livemode: false,
        status: "succeeded",
        amount: 2450,
        currency: "gbp",
        customer: customer.stripeCustomerId,
        payment_method: mandate.stripePaymentMethodId,
        metadata: {
          finance_debit_attempt_id: attempt.id,
          finance_instalment_id: instalment.id,
          private_note: "private",
        },
        client_secret: "private",
      };
      await check({
        tx,
        scope,
        paymentIntent,
        attemptId: attempt.id,
        invoiceId,
        mandateId: mandate.id,
        payerAccountId: invoice.payerAccountId,
        payerUserId: grant.payerUserId,
      });
    },
    "GBP",
  );
}
