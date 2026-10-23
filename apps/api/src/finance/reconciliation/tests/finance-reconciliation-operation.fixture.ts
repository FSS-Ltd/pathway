import { randomUUID } from "node:crypto";
import { withTenantRlsContext, type Prisma } from "@pathway/db";
import { ForbiddenException } from "@nestjs/common";
import type { FinanceAccessService } from "../../access/finance-access.service";
import { FinanceBalanceService } from "../../finance-balance.service";
import { FinanceCommandService } from "../../finance-command.service";
import { FinanceInvoiceService } from "../../finance-invoice.service";
import type { FinanceConnectionScope } from "../finance-reconciliation.types";
import type { FinanceReconciliationObject } from "../../stripe/finance-stripe-reconciliation.provider";

interface OperationFixture {
  tx: Prisma.TransactionClient;
  scope: FinanceConnectionScope;
  checkout: FinanceReconciliationObject;
  attemptId: string;
  invoiceId: string;
  grantId: string;
}

export async function withReconciliationOperation(
  check: (fixture: OperationFixture) => Promise<void>,
  currency: "GBP" | "EUR" = "EUR",
  operationCreatedAt?: Date,
): Promise<void> {
  const orgId = process.env.E2E_ORG_ID;
  if (!orgId) throw new Error("Missing reconciliation fixture organisation");
  const tenantId = randomUUID();
  const connectionId = randomUUID();
  const stripeAccountId = `acct_${randomUUID().replaceAll("-", "")}`;
  const rollback = new Error("Rollback reconciliation operation");
  try {
    await withTenantRlsContext(tenantId, orgId, async (tx) => {
      await tx.tenant.create({
        data: { id: tenantId, orgId, name: "Recovery fixture", slug: tenantId },
      });
      const creator = await tx.user.create({
        data: { email: `${randomUUID()}@example.test` },
      });
      const reviewer = await tx.user.create({
        data: { email: `${randomUUID()}@example.test` },
      });
      const parent = await tx.user.create({
        data: { email: `${randomUUID()}@example.test` },
      });
      const profile = await tx.financeProfile.create({
        data: {
          tenantId,
          orgId,
          legalEntityName: "Recovery fixture",
          countryCode: currency === "GBP" ? "GB" : "NL",
          currency,
        },
      });
      const payer = await tx.financePayerAccount.create({
        data: {
          tenantId,
          orgId,
          financeProfileId: profile.id,
          displayName: "Synthetic payer",
        },
      });
      const grant = await tx.financePayerGrant.create({
        data: {
          tenantId,
          orgId,
          financePayerAccountId: payer.id,
          payerUserId: parent.id,
          grantedByUserId: reviewer.id,
        },
      });
      await tx.financeStripeConnection.create({
        data: {
          id: connectionId,
          tenantId,
          orgId,
          financeProfileId: profile.id,
          requestedByUserId: creator.id,
          stripeAccountId,
          status: "READY",
        },
      });
      // Fixture-only access adapter; production permission and RLS boundaries have separate suites.
      const access = {
        assertStaffAction: jest.fn().mockResolvedValue(undefined),
        authorizeIndependentFinanceApproval: jest.fn(
          async (_scope: unknown, requester: string, approver: string) => {
            if (requester === approver)
              throw new ForbiddenException("Independent approval required");
          },
        ),
      } as unknown as FinanceAccessService;
      const invoices = new FinanceInvoiceService(
        access,
        new FinanceCommandService(),
        new FinanceBalanceService(),
      );
      const actor = { tenantId, orgId, userId: creator.id };
      const draft = await invoices.createDraft(actor, randomUUID(), {
        payerAccountId: payer.id,
        dueDate: "2026-12-31",
        lines: [
          {
            description: "Synthetic fee",
            quantity: "1.000",
            unitAmountMinor: "2450",
            taxRateBasisPoints: 0,
          },
        ],
      });
      await invoices.submitForReview(actor, draft.id, randomUUID());
      await invoices.approve(
        { ...actor, userId: reviewer.id },
        draft.id,
        randomUUID(),
      );
      await invoices.issue(actor, draft.id, randomUUID());
      const attempt = await tx.financeCheckoutAttempt.create({
        data: {
          tenantId,
          orgId,
          financeProfileId: profile.id,
          stripeConnectionId: connectionId,
          payerGrantId: grant.id,
          invoiceId: draft.id,
          stripeAccountId,
          livemode: false,
          amountMinor: 2450n,
          currency,
          idempotencyKey: randomUUID(),
          integrationIdentifier: "nexsteps-finance-abcdefgh",
          ...(operationCreatedAt ? { createdAt: operationCreatedAt } : {}),
        },
      });
      const created = Math.floor(Date.now() / 1000);
      const checkout: FinanceReconciliationObject = {
        id: `cs_${randomUUID().replaceAll("-", "")}`,
        object: "checkout.session",
        created,
        livemode: false,
        mode: "payment",
        status: "complete",
        payment_status: "paid",
        amount_total: 2450,
        currency: currency.toLowerCase(),
        client_reference_id: attempt.id,
        payment_intent: `pi_${randomUUID().replaceAll("-", "")}`,
        expires_at: created + 86400,
        metadata: {
          finance_checkout_attempt_id: attempt.id,
          finance_invoice_id: draft.id,
        },
        customer_details: { email: "private@example.test" },
        client_secret: "fixture-secret",
      };
      await check({
        tx,
        scope: {
          tenantId,
          orgId,
          connectionId,
          stripeAccountId,
          livemode: false,
        },
        checkout,
        attemptId: attempt.id,
        invoiceId: draft.id,
        grantId: grant.id,
      });
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
}
