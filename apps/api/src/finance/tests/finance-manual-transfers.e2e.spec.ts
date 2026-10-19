import { ConflictException, ForbiddenException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { isEncryptedField } from "@pathway/util";
import { withTenantRlsContext } from "@pathway/db";
import { requireDatabase } from "../../../test-helpers.e2e";
import { FinanceAccessService } from "../access/finance-access.service";
import { FinanceCommandService } from "../finance-command.service";
import { FinanceInvoiceService } from "../finance-invoice.service";
import { FinanceBalanceService } from "../finance-balance.service";
import { FinanceManualReceiptService } from "../finance-manual-receipt.service";
import { FinanceBankTransferService } from "../finance-bank-transfer.service";
import { FinanceReceiptService } from "../finance-receipt.service";
import { FinanceManualRefundReturnService } from "../finance-manual-refund-return.service";
import { FinanceRefundService } from "../finance-refund.service";
import { FinanceStripeRefundSubmissionService } from "../stripe/finance-stripe-refund-submission.service";
import { DisabledFinanceStripeRefundProvider } from "../stripe/finance-stripe-refund.provider";

function requiredFixture(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Finance manual transfer test requires ${name}`);
  return value;
}

async function expectForbidden(action: () => Promise<unknown>): Promise<void> {
  try {
    await action();
  } catch (error) {
    if (error instanceof ForbiddenException) return;
    throw error;
  }
  throw new Error("Expected the Finance action to be forbidden");
}

const tenantId = requiredFixture("E2E_TENANT_ID");
const orgId = requiredFixture("E2E_ORG_ID");

describe("Finance manual transfer evidence", () => {
  it("keeps payer notices nonfinancial until an independent receipt approval", async () => {
    if (!requireDatabase()) return;

    const creatorId = randomUUID();
    const reviewerId = randomUUID();
    const payerId = randomUUID();
    const rollbackFixture = new Error(
      "rollback Finance manual transfer fixture",
    );
    const authorizeIndependent = jest.fn(
      async (
        _scope: unknown,
        requesterUserId: string,
        approverUserId: string,
      ) => {
        if (requesterUserId === approverUserId) {
          throw new ForbiddenException("Independent Finance approval required");
        }
      },
    );
    const access = {
      assertStaffAction: jest.fn().mockResolvedValue(undefined),
      assertPayerAction: jest.fn().mockResolvedValue(undefined),
      authorizeIndependentFinanceApproval: authorizeIndependent,
      authorizeIndependentStaffApproval: authorizeIndependent,
    } as unknown as FinanceAccessService;
    const commands = new FinanceCommandService();
    const balances = new FinanceBalanceService();
    const invoices = new FinanceInvoiceService(access, commands, balances);
    const bankTransfers = new FinanceBankTransferService(
      access,
      commands,
      balances,
    );
    const manualReceipts = new FinanceManualReceiptService(
      access,
      commands,
      balances,
    );
    const receipts = new FinanceReceiptService(access, commands, balances);
    const refunds = new FinanceRefundService(
      access,
      commands,
      new FinanceStripeRefundSubmissionService(
        new DisabledFinanceStripeRefundProvider(),
      ),
    );
    const manualRefundReturns = new FinanceManualRefundReturnService(
      access,
      commands,
    );
    const creator = { tenantId, orgId, userId: creatorId };
    const reviewer = { tenantId, orgId, userId: reviewerId };
    const payer = { tenantId, orgId, userId: payerId };

    let fixtureRolledBack = false;
    try {
      await withTenantRlsContext(tenantId, orgId, async (tx) => {
        await tx.user.createMany({
          data: [
            {
              id: creatorId,
              email: `finance-transfer-${creatorId}@example.test`,
            },
            {
              id: reviewerId,
              email: `finance-transfer-${reviewerId}@example.test`,
            },
            { id: payerId, email: `finance-transfer-${payerId}@example.test` },
          ],
        });
        let profile = await tx.financeProfile.findUnique({
          where: { tenantId_orgId: { tenantId, orgId } },
          select: { id: true, legalEntityName: true },
        });
        if (!profile) {
          profile = await tx.financeProfile.create({
            data: {
              tenantId,
              orgId,
              legalEntityName: "Manual transfer test school",
            },
            select: { id: true, legalEntityName: true },
          });
        }
        const payerAccount = await tx.financePayerAccount.create({
          data: {
            financeProfileId: profile.id,
            tenantId,
            orgId,
            displayName: "Manual transfer test family",
          },
        });
        const draft = await invoices.createDraft(
          creator,
          `transfer-invoice-create-${randomUUID()}`,
          {
            payerAccountId: payerAccount.id,
            dueDate: "2026-11-15",
            lines: [
              {
                description: "Term fee",
                quantity: "1.000",
                unitAmountMinor: "2000",
                taxRateBasisPoints: 0,
              },
            ],
          },
        );
        await invoices.submitForReview(
          creator,
          draft.id,
          `transfer-invoice-review-${randomUUID()}`,
        );
        await invoices.approve(
          reviewer,
          draft.id,
          `transfer-invoice-approve-${randomUUID()}`,
        );
        const invoice = await invoices.issue(
          creator,
          draft.id,
          `transfer-invoice-issue-${randomUUID()}`,
        );

        const beforeNotice = await invoices.get(creator, invoice.id);
        const transferredAt = new Date(Date.now() - 60_000).toISOString();
        const noticeInput = {
          amountMinor: "2000",
          declaredTransferredAt: transferredAt,
        };
        const noticeKey = `transfer-notice-${randomUUID()}`;
        const notice = await manualReceipts.submitTransferNotice(
          payer,
          payerAccount.id,
          invoice.id,
          noticeKey,
          noticeInput,
        );
        const replayedNotice = await manualReceipts.submitTransferNotice(
          payer,
          payerAccount.id,
          invoice.id,
          noticeKey,
          noticeInput,
        );
        expect(replayedNotice.id).toBe(notice.id);
        expect(notice.receiptStatus).toBe("DECLARED_ONLY");
        expect((await invoices.get(creator, invoice.id)).balance).toEqual(
          beforeNotice.balance,
        );
        expect(
          await tx.financeReceipt.count({
            where: {
              financeProfileId: profile.id,
              payerAccountId: payerAccount.id,
            },
          }),
        ).toBe(0);

        const bankChange = await bankTransfers.requestChange(
          creator,
          `bank-change-${randomUUID()}`,
          {
            accountHolderName: "Manual transfer test school",
            sortCode: "123456",
            accountNumber: "00123456",
            reason: "Set up the approved school collection account",
          },
        );
        const storedBankDetails = await tx.$queryRaw<
          Array<{
            accountHolderName: string;
            sortCode: string;
            accountNumber: string;
          }>
        >`
          SELECT "accountHolderName", "sortCode", "accountNumber"
          FROM "FinanceBankTransferChange"
          WHERE "id" = ${bankChange.id}
        `;
        expect(storedBankDetails).toHaveLength(1);
        expect(
          Object.values(storedBankDetails[0]).every(isEncryptedField),
        ).toBe(true);
        await expectForbidden(() =>
          bankTransfers.approveChange(
            creator,
            bankChange.id,
            `bank-change-self-approve-${randomUUID()}`,
          ),
        );
        const approvedBankChange = await bankTransfers.approveChange(
          reviewer,
          bankChange.id,
          `bank-change-approve-${randomUUID()}`,
        );
        expect(approvedBankChange.status).toBe("APPROVED");
        expect(
          await bankTransfers.forPayerInvoice(
            payer,
            payerAccount.id,
            invoice.id,
          ),
        ).toEqual({
          accountHolderName: "Manual transfer test school",
          sortCode: "123456",
          accountNumber: "00123456",
          reference: invoice.invoiceNumber,
          currency: "GBP",
          outstandingMinor: "2000",
        });

        const requestInput = {
          payerAccountId: payerAccount.id,
          transferNoticeId: notice.id,
          bankTransactionReference: `BANK-${randomUUID()}`,
          amountMinor: "2000",
          receivedAt: transferredAt,
          reason: "Matched to a credit in the school bank statement",
        };
        const requestKey = `manual-receipt-request-${randomUUID()}`;
        const request = await manualReceipts.createRequest(
          creator,
          requestKey,
          requestInput,
        );
        expect(request.status).toBe("PENDING");
        expect(request.receiptId).toBeNull();
        await tx.$executeRaw`SAVEPOINT finance_manual_receipt_duplicate`;
        await expect(
          manualReceipts.createRequest(
            creator,
            `manual-receipt-duplicate-${randomUUID()}`,
            { ...requestInput, transferNoticeId: undefined },
          ),
        ).rejects.toBeInstanceOf(ConflictException);
        await tx.$executeRaw`ROLLBACK TO SAVEPOINT finance_manual_receipt_duplicate`;
        await tx.$executeRaw`RELEASE SAVEPOINT finance_manual_receipt_duplicate`;
        await expectForbidden(() =>
          manualReceipts.approveRequest(
            creator,
            request.id,
            `manual-receipt-self-approve-${randomUUID()}`,
          ),
        );
        expect((await invoices.get(creator, invoice.id)).balance).toEqual(
          beforeNotice.balance,
        );
        expect(
          await tx.financeReceipt.count({
            where: {
              financeProfileId: profile.id,
              payerAccountId: payerAccount.id,
            },
          }),
        ).toBe(0);

        const approvalKey = `manual-receipt-approve-${randomUUID()}`;
        const approvedRequest = await manualReceipts.approveRequest(
          reviewer,
          request.id,
          approvalKey,
        );
        const replayedApproval = await manualReceipts.approveRequest(
          reviewer,
          request.id,
          approvalKey,
        );
        expect(approvedRequest.status).toBe("APPROVED");
        expect(approvedRequest.receiptId).toBeTruthy();
        expect(replayedApproval.receiptId).toBe(approvedRequest.receiptId);
        if (!approvedRequest.receiptId) {
          throw new Error("Approved manual receipt must create a receipt");
        }
        expect(
          await receipts.get(creator, approvedRequest.receiptId),
        ).toMatchObject({ status: "CONFIRMED", source: "MANUAL_TRANSFER" });
        expect((await invoices.get(creator, invoice.id)).balance).toEqual(
          beforeNotice.balance,
        );

        const originalAllocation = await receipts.allocate(
          creator,
          approvedRequest.receiptId,
          `manual-receipt-allocation-${randomUUID()}`,
          { invoiceId: invoice.id, amountMinor: "2000" },
        );
        expect(
          (await invoices.get(creator, invoice.id)).balance.outstandingMinor,
        ).toBe("0");

        const refundRequest = await refunds.request(
          creator,
          approvedRequest.receiptId,
          `manual-refund-request-${randomUUID()}`,
          { amountMinor: "700", reason: "Correct an overpayment" },
        );
        expect(refundRequest.status).toBe("PENDING");
        expect(
          (await invoices.get(creator, invoice.id)).balance.outstandingMinor,
        ).toBe("0");
        await expectForbidden(() =>
          refunds.approve(
            creator,
            refundRequest.id,
            `manual-refund-self-approve-${randomUUID()}`,
            { reason: "Reviewed bank evidence" },
          ),
        );

        const approvedRefund = await refunds.approve(
          reviewer,
          refundRequest.id,
          `manual-refund-approve-${randomUUID()}`,
          { reason: "Reviewed bank evidence" },
        );
        expect(approvedRefund.status).toBe("APPROVED");
        expect(
          (await invoices.get(creator, invoice.id)).balance.outstandingMinor,
        ).toBe("0");

        const confirmedRefund = await refunds.confirmManualRefund(
          creator,
          refundRequest.id,
          `manual-refund-confirm-${randomUUID()}`,
          { bankTransactionReference: `BANK-REFUND-${randomUUID()}` },
        );
        expect(confirmedRefund.status).toBe("CONFIRMED");
        expect((await invoices.get(creator, invoice.id)).balance).toMatchObject(
          {
            allocatedReceiptsMinor: "1300",
            outstandingMinor: "700",
          },
        );
        await expect(
          receipts.reverseAllocation(
            creator,
            originalAllocation.id,
            `manual-reverse-after-refund-excess-${randomUUID()}`,
            {
              amountMinor: "1301",
              reason: "Do not reverse refunded funds twice",
            },
          ),
        ).rejects.toBeInstanceOf(ConflictException);
        const reversalAfterRefund = await receipts.reverseAllocation(
          creator,
          originalAllocation.id,
          `manual-reverse-after-refund-${randomUUID()}`,
          { amountMinor: "1300", reason: "Reverse remaining allocated funds" },
        );
        expect(reversalAfterRefund.amountMinor).toBe("1300");
        expect(
          (await invoices.get(creator, invoice.id)).balance.outstandingMinor,
        ).toBe("2000");
        const manualReturnReference = `BANK-RETURN-${randomUUID()}`;
        const returnRequest = await manualRefundReturns.requestManualReturn(
          creator,
          refundRequest.id,
          `manual-refund-return-request-${randomUUID()}`,
          {
            bankTransactionReference: manualReturnReference,
            reason: "Bank returned the refund transfer",
          },
        );
        expect(returnRequest.status).toBe("CONFIRMED");
        await expectForbidden(() =>
          manualRefundReturns.approveManualReturn(
            creator,
            refundRequest.id,
            `manual-refund-return-self-approve-${randomUUID()}`,
            { reason: "Review return evidence" },
          ),
        );
        const returnApprovalKey = `manual-refund-return-approve-${randomUUID()}`;
        const returnedRefund = await manualRefundReturns.approveManualReturn(
          reviewer,
          refundRequest.id,
          returnApprovalKey,
          { reason: "Matched the bank return" },
        );
        expect(returnedRefund.status).toBe("RETURNED");
        expect(
          (await invoices.get(creator, invoice.id)).balance.outstandingMinor,
        ).toBe("1300");
        expect(
          (
            await manualRefundReturns.approveManualReturn(
              reviewer,
              refundRequest.id,
              returnApprovalKey,
              { reason: "Matched the bank return" },
            )
          ).status,
        ).toBe("RETURNED");
        const confirmedRefundReplay = await refunds.get(
          creator,
          refundRequest.id,
        );
        const refundEventTypes = confirmedRefundReplay.events.map(
          ({ type }) => type,
        );
        expect(refundEventTypes.slice(0, 4)).toEqual([
          "REQUESTED",
          "APPROVED",
          "CONFIRMED",
          "RETURN_REQUESTED",
        ]);
        const returnEventTypes = refundEventTypes.slice(4);
        // The approval and return share a transaction timestamp, so the id
        // tie-breaker does not encode an order between these atomic events.
        expect(returnEventTypes).toHaveLength(2);
        expect(returnEventTypes).toEqual(
          expect.arrayContaining(["RETURN_APPROVED", "RETURNED"]),
        );
        await expect(
          refunds.request(
            creator,
            approvedRequest.receiptId,
            `manual-refund-excess-${randomUUID()}`,
            { amountMinor: "2001", reason: "Excess amount test" },
          ),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(authorizeIndependent).toHaveBeenCalledWith(
          expect.objectContaining({ tenantId, orgId }),
          creatorId,
          reviewerId,
          expect.any(String),
        );
        throw rollbackFixture;
      });
    } catch (error) {
      if (error !== rollbackFixture) throw error;
      fixtureRolledBack = true;
    }
    expect(fixtureRolledBack).toBe(true);
  });
});
