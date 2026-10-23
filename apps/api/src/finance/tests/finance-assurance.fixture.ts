import { ForbiddenException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { withTenantRlsContext } from "@pathway/db";
import type { FinanceAccessService } from "../access/finance-access.service";
import { FinanceBalanceService } from "../finance-balance.service";
import { FinanceCommandService } from "../finance-command.service";
import { FinanceInvoiceService } from "../finance-invoice.service";
import { FinanceManualReceiptService } from "../finance-manual-receipt.service";
import { FinanceReceiptService } from "../finance-receipt.service";

/** Committed synthetic records live until the central disposable database is reset.
 * Separate transactions are essential: an outer rollback transaction would reuse
 * its AsyncLocalStorage client and turn concurrent service calls into a fake race.
 */
export async function createFinanceAssuranceFixture(
  orgId = process.env.E2E_ORG_ID,
) {
  if (!orgId) throw new Error("Finance assurance requires E2E_ORG_ID");
  const tenantId = randomUUID();
  const fixture = await withTenantRlsContext(tenantId, orgId, async (tx) => {
    await tx.tenant.create({
      data: { id: tenantId, orgId, name: "Finance assurance", slug: tenantId },
    });
    const users = await Promise.all(
      ["creator", "reviewer", "payer"].map((role) =>
        tx.user.create({
          data: { email: `assurance-${role}-${randomUUID()}@example.test` },
        }),
      ),
    );
    const [creator, reviewer, payerUser] = users;
    if (!creator || !reviewer || !payerUser)
      throw new Error("Missing assurance actors");
    const profile = await tx.financeProfile.create({
      data: {
        tenantId,
        orgId,
        legalEntityName: "Synthetic assurance school",
        countryCode: "GB",
        currency: "GBP",
      },
    });
    const payer = await tx.financePayerAccount.create({
      data: {
        tenantId,
        orgId,
        financeProfileId: profile.id,
        displayName: "Synthetic assurance payer",
      },
    });
    const grant = await tx.financePayerGrant.create({
      data: {
        tenantId,
        orgId,
        financePayerAccountId: payer.id,
        payerUserId: payerUser.id,
        grantedByUserId: reviewer.id,
      },
    });
    const connection = await tx.financeStripeConnection.create({
      data: {
        tenantId,
        orgId,
        financeProfileId: profile.id,
        requestedByUserId: creator.id,
        stripeAccountId: `acct_${randomUUID().replaceAll("-", "")}`,
        status: "READY",
      },
    });
    return { profile, payer, grant, connection, creator, reviewer, payerUser };
  });
  // Access is independently covered by HTTP assurance; this adapter enforces the
  // distinct human reviewer while exercising real ledger/command transactions.
  const independent = async (
    _scope: unknown,
    requester: string,
    approver: string,
  ) => {
    if (requester === approver)
      throw new ForbiddenException("Independent approval required");
  };
  const access = {
    assertStaffAction: jest.fn().mockResolvedValue(undefined),
    assertPayerAction: jest.fn().mockResolvedValue(undefined),
    authorizeIndependentFinanceApproval: independent,
    authorizeIndependentStaffApproval: independent,
    resolveMode: jest.fn().mockResolvedValue("ACTIVE"),
  } as unknown as FinanceAccessService;
  const balances = new FinanceBalanceService();
  const commands = new FinanceCommandService();
  const invoices = new FinanceInvoiceService(access, commands, balances);
  const manualReceipts = new FinanceManualReceiptService(
    access,
    commands,
    balances,
  );
  const receipts = new FinanceReceiptService(access, commands, balances);
  const actor = { tenantId, orgId, userId: fixture.creator.id };
  const reviewer = { ...actor, userId: fixture.reviewer.id };
  const payerActor = { ...actor, userId: fixture.payerUser.id };
  async function createReviewedInvoice(amountMinor: string) {
    const draft = await invoices.createDraft(actor, randomUUID(), {
      payerAccountId: fixture.payer.id,
      dueDate: "2026-12-31",
      lines: [
        {
          description: "Synthetic assurance charge",
          quantity: "1.000",
          unitAmountMinor: amountMinor,
          taxRateBasisPoints: 0,
        },
      ],
    });
    await invoices.submitForReview(actor, draft.id, randomUUID());
    await invoices.approve(reviewer, draft.id, randomUUID());
    return draft.id;
  }
  async function createIssuedInvoice(amountMinor: string) {
    const id = await createReviewedInvoice(amountMinor);
    await invoices.issue(actor, id, randomUUID());
    return id;
  }
  return {
    ...fixture,
    tenantId,
    orgId,
    access,
    balances,
    commands,
    invoices,
    manualReceipts,
    receipts,
    actor,
    reviewer,
    payerActor,
    createReviewedInvoice,
    createIssuedInvoice,
  };
}
export type FinanceAssuranceFixture = Awaited<
  ReturnType<typeof createFinanceAssuranceFixture>
>;
