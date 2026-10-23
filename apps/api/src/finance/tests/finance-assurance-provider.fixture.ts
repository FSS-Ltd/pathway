import { randomUUID } from "node:crypto";
import { withTenantRlsContext } from "@pathway/db";
import { FinanceStripePaymentWebhookService } from "../stripe/finance-stripe-payment-webhook.service";
import { FinanceStripeBacsWebhookService } from "../stripe/finance-stripe-bacs-webhook.service";
import {
  FINANCE_BACS_COLLECTION_TERMS_VERSION,
  FINANCE_BACS_MANDATE_CONSENT_VERSION,
} from "../domain/finance-collection-terms";
import type { FinanceAssuranceFixture } from "./finance-assurance.fixture";

export async function prepareAssuranceProviderSuccess(
  f: FinanceAssuranceFixture,
  invoiceId: string,
  method: "card" | "bacs",
  amount: number,
): Promise<() => Promise<unknown>> {
  const stripeAccountId = f.connection.stripeAccountId;
  if (!stripeAccountId) throw new Error("Missing synthetic connected account");
  const account = {
    tenantId: f.tenantId,
    orgId: f.orgId,
    financeProfileId: f.profile.id,
    stripeConnectionId: f.connection.id,
    stripeAccountId,
  };
  const eventId = `evt_${randomUUID().replaceAll("-", "")}`;
  const paymentIntentId = `pi_${randomUUID().replaceAll("-", "")}`;
  const created = Math.floor(Date.now() / 1000);
  const common = {
    stripeEventId: eventId,
    tenantId: f.tenantId,
    orgId: f.orgId,
    stripeAccountId,
    livemode: false,
  };
  if (method === "card") {
    const sessionId = `cs_${randomUUID().replaceAll("-", "")}`;
    const attempt = await withTenantRlsContext(
      f.tenantId,
      f.orgId,
      async (tx) => {
        const attempt = await tx.financeCheckoutAttempt.create({
          data: {
            ...account,
            payerGrantId: f.grant.id,
            invoiceId,
            livemode: false,
            amountMinor: BigInt(amount),
            currency: "GBP",
            idempotencyKey: randomUUID(),
            integrationIdentifier: "nexsteps-finance-abcdefgh",
          },
        });
        await tx.financeCheckoutAttempt.update({
          where: { id: attempt.id },
          data: {
            status: "EXPIRED",
            stripeCheckoutSessionId: sessionId,
            checkoutUrl: "https://checkout.stripe.com/c/pay/assurance",
            expiresAt: new Date(Date.now() - 1000),
          },
        });
        return attempt;
      },
    );
    const eventType = "checkout.session.async_payment_succeeded";
    const input = {
      ...common,
      eventType,
      payloadJson: {
        id: eventId,
        type: eventType,
        created,
        account: stripeAccountId,
        livemode: false,
        data: {
          object: {
            id: sessionId,
            object: "checkout.session",
            client_reference_id: attempt.id,
            amount_total: amount,
            currency: "gbp",
            payment_intent: paymentIntentId,
            payment_status: "paid",
            status: "complete",
            metadata: {
              finance_checkout_attempt_id: attempt.id,
              finance_invoice_id: invoiceId,
            },
          },
        },
      },
    };
    const service = new FinanceStripePaymentWebhookService(f.balances);
    return () => service.process(input);
  }
  const prepared = await withTenantRlsContext(
    f.tenantId,
    f.orgId,
    async (tx) => {
      const customer = await tx.financeStripeCustomer.create({
        data: {
          ...account,
          payerAccountId: f.payer.id,
          stripeCustomerId: `cus_${randomUUID().replaceAll("-", "")}`,
          livemode: false,
        },
      });
      const mandate = await tx.financeMandate.create({
        data: {
          ...account,
          payerAccountId: f.payer.id,
          financeStripeCustomerId: customer.id,
          livemode: false,
          status: "ACTIVE",
          createdByUserId: f.payerUser.id,
          acceptedByUserId: f.payerUser.id,
          acceptedAt: new Date(),
          consentVersion: FINANCE_BACS_MANDATE_CONSENT_VERSION,
          stripeSetupIntentId: `seti_${randomUUID().replaceAll("-", "")}`,
          stripePaymentMethodId: `pm_${randomUUID().replaceAll("-", "")}`,
          stripeMandateId: `mandate_${randomUUID().replaceAll("-", "")}`,
        },
      });
      const plan = await tx.financeCollectionPlan.create({
        data: {
          financeProfileId: f.profile.id,
          payerAccountId: f.payer.id,
          stripeConnectionId: f.connection.id,
          tenantId: f.tenantId,
          orgId: f.orgId,
          invoiceId,
          mandateId: mandate.id,
          status: "ACTIVE",
          amountMinor: BigInt(amount),
          currency: "GBP",
          instalmentCount: 1,
          firstDueAt: new Date(),
          dayOfMonth: 23,
          consentVersion: FINANCE_BACS_COLLECTION_TERMS_VERSION,
          createdByUserId: f.creator.id,
          approvedByUserId: f.reviewer.userId,
          approvedAt: new Date(),
          acceptedByUserId: f.payerUser.id,
          acceptedAt: new Date(),
        },
      });
      const instalment = await tx.financeCollectionInstalment.create({
        data: {
          planId: plan.id,
          tenantId: f.tenantId,
          orgId: f.orgId,
          sequence: 1,
          amountMinor: BigInt(amount),
          dueAt: new Date(),
          status: "SUBMISSION_PENDING",
        },
      });
      const attempt = await tx.financeDebitAttempt.create({
        data: {
          instalmentId: instalment.id,
          stripeConnectionId: f.connection.id,
          stripeAccountId,
          tenantId: f.tenantId,
          orgId: f.orgId,
          amountMinor: BigInt(amount),
          currency: "GBP",
          idempotencyKey: randomUUID(),
        },
      });
      return { customer, mandate, instalment, attempt };
    },
  );
  const eventType = "payment_intent.succeeded";
  const input = {
    ...common,
    eventType,
    payloadJson: {
      id: eventId,
      type: eventType,
      created,
      account: stripeAccountId,
      livemode: false,
      data: {
        object: {
          id: paymentIntentId,
          object: "payment_intent",
          livemode: false,
          status: "succeeded",
          amount,
          currency: "gbp",
          customer: prepared.customer.stripeCustomerId,
          payment_method: prepared.mandate.stripePaymentMethodId,
          metadata: {
            finance_debit_attempt_id: prepared.attempt.id,
            finance_instalment_id: prepared.instalment.id,
          },
        },
      },
    },
  };
  const service = new FinanceStripeBacsWebhookService(f.access, f.balances, {
    detachPaymentMethod: async () => {
      throw new Error("Provider writes forbidden in assurance fixture");
    },
  });
  return () => service.process(input);
}
