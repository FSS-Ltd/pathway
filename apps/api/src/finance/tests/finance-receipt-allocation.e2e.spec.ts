import { ConflictException, ForbiddenException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { withTenantRlsContext } from "@pathway/db";
import { requireDatabase } from "../../../test-helpers.e2e";
import { FinanceAccessService } from "../access/finance-access.service";
import { FinanceCommandService } from "../finance-command.service";
import { FinanceCreditNoteService } from "../finance-credit-note.service";
import { FinanceInvoiceService } from "../finance-invoice.service";
import { FinanceBalanceService } from "../finance-balance.service";
import { FinanceReceiptService } from "../finance-receipt.service";

function requiredFixture(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Finance receipt test requires ${name}`);
  return value;
}

const tenantId = requiredFixture("E2E_TENANT_ID");
const orgId = requiredFixture("E2E_ORG_ID");

describe("Finance receipt allocation ledger", () => {
  it("projects issued credits and confirmed allocations and preserves reversals", async () => {
    if (!requireDatabase()) return;

    const creatorId = randomUUID();
    const reviewerId = randomUUID();
    const rollbackFixture = new Error("rollback Finance receipt fixture");
    const access = {
      assertStaffAction: jest.fn().mockResolvedValue(undefined),
      authorizeIndependentFinanceApproval: jest.fn(
        async (
          _scope: unknown,
          requesterUserId: string,
          approverUserId: string,
        ) => {
          if (requesterUserId === approverUserId) {
            throw new ForbiddenException(
              "Independent Finance approval required",
            );
          }
        },
      ),
    } as unknown as FinanceAccessService;
    const commands = new FinanceCommandService();
    const balances = new FinanceBalanceService();
    const invoices = new FinanceInvoiceService(access, commands, balances);
    const credits = new FinanceCreditNoteService(access, commands);
    const receipts = new FinanceReceiptService(access, commands, balances);
    const creator = { tenantId, orgId, userId: creatorId };
    const reviewer = { tenantId, orgId, userId: reviewerId };

    await expect(
      withTenantRlsContext(tenantId, orgId, async (tx) => {
        await tx.user.createMany({
          data: [
            {
              id: creatorId,
              email: `finance-receipt-${creatorId}@example.test`,
            },
            {
              id: reviewerId,
              email: `finance-receipt-reviewer-${reviewerId}@example.test`,
            },
          ],
        });
        let profile = await tx.financeProfile.findUnique({
          where: { tenantId_orgId: { tenantId, orgId } },
          select: { id: true },
        });
        if (!profile) {
          profile = await tx.financeProfile.create({
            data: {
              tenantId,
              orgId,
              legalEntityName: "Finance receipt test school",
            },
            select: { id: true },
          });
        }
        const payer = await tx.financePayerAccount.create({
          data: {
            financeProfileId: profile.id,
            tenantId,
            orgId,
            displayName: "Finance receipt test family",
          },
        });
        const otherPayer = await tx.financePayerAccount.create({
          data: {
            financeProfileId: profile.id,
            tenantId,
            orgId,
            displayName: "Different family",
          },
        });
        const draft = await invoices.createDraft(
          creator,
          `invoice-create-${randomUUID()}`,
          {
            payerAccountId: payer.id,
            dueDate: "2026-11-15",
            lines: [
              {
                description: "Term fee",
                quantity: "2.000",
                unitAmountMinor: "1000",
                taxRateBasisPoints: 0,
              },
            ],
          },
        );
        await invoices.submitForReview(
          creator,
          draft.id,
          `invoice-review-${randomUUID()}`,
        );
        await invoices.approve(
          reviewer,
          draft.id,
          `invoice-approve-${randomUUID()}`,
        );
        const invoice = await invoices.issue(
          creator,
          draft.id,
          `invoice-issue-${randomUUID()}`,
        );

        const credit = await credits.createDraft(
          creator,
          invoice.id,
          `credit-create-${randomUUID()}`,
          {
            reason: "Half a term session credited",
            lines: [
              { sourceInvoiceLineId: invoice.lines[0].id, quantity: "0.500" },
            ],
          },
        );
        await credits.submitForReview(
          creator,
          credit.id,
          `credit-review-${randomUUID()}`,
        );
        await credits.approve(
          reviewer,
          credit.id,
          `credit-approve-${randomUUID()}`,
        );
        await credits.issue(creator, credit.id, `credit-issue-${randomUUID()}`);

        const firstReceipt = await tx.financeReceipt.create({
          data: {
            financeProfileId: profile.id,
            payerAccountId: payer.id,
            tenantId,
            orgId,
            amountMinor: 1000n,
            source: "MANUAL_TRANSFER",
            status: "CONFIRMED",
            confirmedAt: new Date(),
          },
        });
        const secondReceipt = await tx.financeReceipt.create({
          data: {
            financeProfileId: profile.id,
            payerAccountId: payer.id,
            tenantId,
            orgId,
            amountMinor: 800n,
            source: "STRIPE_CARD",
            status: "CONFIRMED",
            confirmedAt: new Date(),
          },
        });
        const processingReceipt = await tx.financeReceipt.create({
          data: {
            financeProfileId: profile.id,
            payerAccountId: payer.id,
            tenantId,
            orgId,
            amountMinor: 1000n,
            source: "STRIPE_CARD",
            status: "PROCESSING",
          },
        });
        const otherPayerReceipt = await tx.financeReceipt.create({
          data: {
            financeProfileId: profile.id,
            payerAccountId: otherPayer.id,
            tenantId,
            orgId,
            amountMinor: 1000n,
            source: "MANUAL_TRANSFER",
            status: "CONFIRMED",
            confirmedAt: new Date(),
          },
        });

        const initialInvoice = await invoices.get(creator, invoice.id);
        expect(initialInvoice.balance).toEqual({
          issuedGrossMinor: "2000",
          issuedCreditsMinor: "500",
          allocatedReceiptsMinor: "0",
          outstandingMinor: "1500",
          creditBalanceMinor: "0",
        });

        const firstKey = `allocate-first-${randomUUID()}`;
        const firstAllocation = await receipts.allocate(
          creator,
          firstReceipt.id,
          firstKey,
          { invoiceId: invoice.id, amountMinor: "800" },
        );
        const replayedAllocation = await receipts.allocate(
          creator,
          firstReceipt.id,
          firstKey,
          { invoiceId: invoice.id, amountMinor: "800" },
        );
        expect(replayedAllocation.id).toBe(firstAllocation.id);

        const secondAllocation = await receipts.allocate(
          creator,
          secondReceipt.id,
          `allocate-second-${randomUUID()}`,
          { invoiceId: invoice.id, amountMinor: "700" },
        );
        expect(secondAllocation.amountMinor).toBe("700");
        expect((await invoices.get(creator, invoice.id)).balance).toEqual({
          issuedGrossMinor: "2000",
          issuedCreditsMinor: "500",
          allocatedReceiptsMinor: "1500",
          outstandingMinor: "0",
          creditBalanceMinor: "0",
        });
        expect(
          (await receipts.get(creator, firstReceipt.id)).unappliedMinor,
        ).toBe("200");

        await expect(
          receipts.allocate(creator, firstReceipt.id, firstKey, {
            invoiceId: invoice.id,
            amountMinor: "900",
          }),
        ).rejects.toBeInstanceOf(ConflictException);
        await expect(
          receipts.allocate(
            creator,
            firstReceipt.id,
            `allocate-excess-${randomUUID()}`,
            { invoiceId: invoice.id, amountMinor: "201" },
          ),
        ).rejects.toBeInstanceOf(ConflictException);
        await expect(
          receipts.allocate(
            creator,
            processingReceipt.id,
            `allocate-processing-${randomUUID()}`,
            { invoiceId: invoice.id, amountMinor: "100" },
          ),
        ).rejects.toBeInstanceOf(ConflictException);
        await expect(
          receipts.allocate(
            creator,
            otherPayerReceipt.id,
            `allocate-other-payer-${randomUUID()}`,
            { invoiceId: invoice.id, amountMinor: "100" },
          ),
        ).rejects.toBeInstanceOf(ConflictException);

        const reversalKey = `reverse-allocation-${randomUUID()}`;
        const reversal = await receipts.reverseAllocation(
          creator,
          firstAllocation.id,
          reversalKey,
          { amountMinor: "300", reason: "Correct allocation amount" },
        );
        const replayedReversal = await receipts.reverseAllocation(
          creator,
          firstAllocation.id,
          reversalKey,
          { amountMinor: "300", reason: "Correct allocation amount" },
        );
        expect(replayedReversal.id).toBe(reversal.id);
        expect(reversal.amountMinor).toBe("300");
        expect((await invoices.get(creator, invoice.id)).balance).toEqual({
          issuedGrossMinor: "2000",
          issuedCreditsMinor: "500",
          allocatedReceiptsMinor: "1200",
          outstandingMinor: "300",
          creditBalanceMinor: "0",
        });
        expect(
          (await receipts.get(creator, firstReceipt.id)).unappliedMinor,
        ).toBe("500");
        await expect(
          receipts.reverseAllocation(
            creator,
            firstAllocation.id,
            `reverse-too-much-${randomUUID()}`,
            { amountMinor: "501", reason: "Exceeds remaining allocation" },
          ),
        ).rejects.toBeInstanceOf(ConflictException);

        const allocationRows = await tx.financeReceiptAllocation.count({
          where: { invoiceId: invoice.id },
        });
        const reversalRows = await tx.financeReceiptAllocationReversal.count({
          where: { allocationId: firstAllocation.id },
        });
        expect(allocationRows).toBe(2);
        expect(reversalRows).toBe(1);

        await tx.$executeRaw`SAVEPOINT finance_allocation_append_only_check`;
        await expect(
          tx.$executeRaw`
            UPDATE "FinanceReceiptAllocation"
            SET "amountMinor" = 801
            WHERE "id" = ${firstAllocation.id}
          `,
        ).rejects.toMatchObject({ code: "P2010", meta: { code: "23514" } });
        await tx.$executeRaw`ROLLBACK TO SAVEPOINT finance_allocation_append_only_check`;
        await tx.$executeRaw`SAVEPOINT finance_reversal_append_only_check`;
        await expect(
          tx.$executeRaw`
            UPDATE "FinanceReceiptAllocationReversal"
            SET "amountMinor" = 301
            WHERE "id" = ${reversal.id}
          `,
        ).rejects.toMatchObject({ code: "P2010", meta: { code: "23514" } });
        await tx.$executeRaw`ROLLBACK TO SAVEPOINT finance_reversal_append_only_check`;
        await tx.$executeRaw`SAVEPOINT finance_receipt_fact_immutable_check`;
        await expect(
          tx.$executeRaw`
            UPDATE "FinanceReceipt"
            SET "amountMinor" = 1001
            WHERE "id" = ${firstReceipt.id}
          `,
        ).rejects.toMatchObject({ code: "P2010", meta: { code: "23514" } });
        await tx.$executeRaw`ROLLBACK TO SAVEPOINT finance_receipt_fact_immutable_check`;
        await tx.$executeRaw`SAVEPOINT finance_receipt_status_immutable_check`;
        await expect(
          tx.$executeRaw`
            UPDATE "FinanceReceipt"
            SET "status" = 'FAILED', "confirmedAt" = NULL
            WHERE "id" = ${firstReceipt.id}
          `,
        ).rejects.toMatchObject({ code: "P2010", meta: { code: "23514" } });
        await tx.$executeRaw`ROLLBACK TO SAVEPOINT finance_receipt_status_immutable_check`;
        await tx.$executeRaw`SAVEPOINT finance_receipt_confirmation_transition_check`;
        await tx.$executeRaw`
          UPDATE "FinanceReceipt"
          SET "status" = 'CONFIRMED', "confirmedAt" = NOW()
          WHERE "id" = ${processingReceipt.id}
        `;
        await expect(
          tx.$executeRaw`
            UPDATE "FinanceReceipt"
            SET "status" = 'FAILED', "confirmedAt" = NULL
            WHERE "id" = ${processingReceipt.id}
          `,
        ).rejects.toMatchObject({ code: "P2010", meta: { code: "23514" } });
        await tx.$executeRaw`ROLLBACK TO SAVEPOINT finance_receipt_confirmation_transition_check`;
        await tx.$executeRaw`SAVEPOINT finance_receipt_delete_immutable_check`;
        await expect(
          tx.$executeRaw`
            DELETE FROM "FinanceReceipt"
            WHERE "id" = ${firstReceipt.id}
          `,
        ).rejects.toMatchObject({ code: "P2010", meta: { code: "23514" } });
        await tx.$executeRaw`ROLLBACK TO SAVEPOINT finance_receipt_delete_immutable_check`;
        throw rollbackFixture;
      }),
    ).rejects.toBe(rollbackFixture);
  });
});
