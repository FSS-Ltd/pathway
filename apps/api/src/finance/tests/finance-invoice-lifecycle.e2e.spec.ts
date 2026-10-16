import { ConflictException, ForbiddenException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { withTenantRlsContext } from "@pathway/db";
import { requireDatabase } from "../../../test-helpers.e2e";
import { FinanceAccessService } from "../access/finance-access.service";
import { FinanceCommandService } from "../finance-command.service";
import { FinanceCreditNoteService } from "../finance-credit-note.service";
import { FinanceBalanceService } from "../finance-balance.service";
import { FinanceInvoiceService } from "../finance-invoice.service";

function requiredFixture(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Finance lifecycle test requires ${name}`);
  return value;
}

async function expectFinanceCheckViolation(operation: () => Promise<unknown>) {
  await expect(operation()).rejects.toMatchObject({
    code: "P2010",
    meta: { code: "23514" },
  });
}

const tenantId = requiredFixture("E2E_TENANT_ID");
const orgId = requiredFixture("E2E_ORG_ID");

describe("Finance invoice and credit lifecycle", () => {
  it("calculates, reviews, issues, credits and replays commands atomically", async () => {
    if (!requireDatabase()) return;

    const creatorId = randomUUID();
    const reviewerId = randomUUID();
    const rollbackFixture = new Error("rollback Finance lifecycle fixture");
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
    const invoices = new FinanceInvoiceService(
      access,
      commands,
      new FinanceBalanceService(),
    );
    const creditNotes = new FinanceCreditNoteService(access, commands);
    const creator = { tenantId, orgId, userId: creatorId };
    const reviewer = { tenantId, orgId, userId: reviewerId };

    await expect(
      withTenantRlsContext(tenantId, orgId, async (tx) => {
        await tx.user.createMany({
          data: [
            {
              id: creatorId,
              email: `finance-lifecycle-${creatorId}@example.test`,
            },
            {
              id: reviewerId,
              email: `finance-reviewer-${reviewerId}@example.test`,
            },
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
              legalEntityName: "Finance lifecycle test school",
            },
            select: { id: true, legalEntityName: true },
          });
        }
        const payer = await tx.financePayerAccount.create({
          data: {
            financeProfileId: profile.id,
            tenantId,
            orgId,
            displayName: "Finance lifecycle test family",
          },
        });
        const draftInput = {
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
        };
        const createKey = `invoice-create-${randomUUID()}`;
        const draft = await invoices.createDraft(
          creator,
          createKey,
          draftInput,
        );
        const replayedDraft = await invoices.createDraft(
          creator,
          createKey,
          draftInput,
        );
        expect(replayedDraft.id).toBe(draft.id);
        expect(draft.status).toBe("DRAFT");
        expect(draft.subtotalMinor).toBe("2000");
        expect(draft.taxMinor).toBe("0");
        expect(draft.totalMinor).toBe("2000");

        await tx.$executeRaw`SAVEPOINT finance_invoice_creator_check`;
        await expectFinanceCheckViolation(
          () =>
            tx.$executeRaw`
            UPDATE "FinanceInvoice"
            SET "createdByUserId" = ${reviewerId}
            WHERE "id" = ${draft.id}
          `,
        );
        await tx.$executeRaw`ROLLBACK TO SAVEPOINT finance_invoice_creator_check`;

        await tx.$executeRaw`SAVEPOINT finance_idempotency_conflict`;
        await expect(
          invoices.createDraft(creator, createKey, {
            ...draftInput,
            lines: [{ ...draftInput.lines[0], unitAmountMinor: "1100" }],
          }),
        ).rejects.toBeInstanceOf(ConflictException);
        await tx.$executeRaw`ROLLBACK TO SAVEPOINT finance_idempotency_conflict`;

        const updated = await invoices.updateDraft(
          creator,
          draft.id,
          `invoice-update-${randomUUID()}`,
          {
            ...draftInput,
            lines: [{ ...draftInput.lines[0], unitAmountMinor: "2000" }],
          },
        );
        expect(updated.subtotalMinor).toBe("4000");
        expect(updated.totalMinor).toBe("4000");

        await invoices.submitForReview(
          creator,
          draft.id,
          `invoice-review-${randomUUID()}`,
        );
        await tx.$executeRaw`SAVEPOINT finance_invoice_review_content_check`;
        await expectFinanceCheckViolation(
          () =>
            tx.$executeRaw`
            UPDATE "FinanceInvoice"
            SET "dueAt" = CURRENT_TIMESTAMP
            WHERE "id" = ${draft.id}
          `,
        );
        await tx.$executeRaw`ROLLBACK TO SAVEPOINT finance_invoice_review_content_check`;
        await tx.$executeRaw`SAVEPOINT finance_invoice_review_line_check`;
        await expectFinanceCheckViolation(
          () =>
            tx.$executeRaw`
            DELETE FROM "FinanceInvoiceLine"
            WHERE "invoiceId" = ${draft.id}
          `,
        );
        await tx.$executeRaw`ROLLBACK TO SAVEPOINT finance_invoice_review_line_check`;
        await expect(
          invoices.approve(creator, draft.id, `invoice-self-${randomUUID()}`),
        ).rejects.toBeInstanceOf(ForbiddenException);
        await invoices.approve(
          reviewer,
          draft.id,
          `invoice-approve-${randomUUID()}`,
        );
        const numberSequence = await tx.financeInvoiceNumberSequence.findUnique(
          {
            where: {
              financeProfileId_tenantId_orgId: {
                financeProfileId: profile.id,
                tenantId,
                orgId,
              },
            },
            select: { lastIssuedNumber: true },
          },
        );
        const expectedInvoiceNumber = (
          (numberSequence?.lastIssuedNumber ?? 0n) + 1n
        ).toString();
        const issueKey = `invoice-issue-${randomUUID()}`;
        const issued = await invoices.issue(creator, draft.id, issueKey);
        const replayedIssue = await invoices.issue(creator, draft.id, issueKey);
        expect(issued.status).toBe("ISSUED");
        expect(issued.invoiceNumber).toBe(expectedInvoiceNumber);
        expect(issued.payerNameSnapshot).toBe(payer.displayName);
        expect(issued.legalEntityNameSnapshot).toBe(profile.legalEntityName);
        expect(replayedIssue.invoiceNumber).toBe(expectedInvoiceNumber);

        const creditInput = {
          reason: "One week of sessions cancelled",
          lines: [
            { sourceInvoiceLineId: issued.lines[0].id, quantity: "1.000" },
          ],
        };
        const creditKey = `credit-create-${randomUUID()}`;
        const credit = await creditNotes.createDraft(
          creator,
          issued.id,
          creditKey,
          creditInput,
        );
        const replayedCredit = await creditNotes.createDraft(
          creator,
          issued.id,
          creditKey,
          creditInput,
        );
        expect(replayedCredit.id).toBe(credit.id);
        expect(credit.totalMinor).toBe("2000");
        await creditNotes.submitForReview(
          creator,
          credit.id,
          `credit-review-${randomUUID()}`,
        );
        await creditNotes.approve(
          reviewer,
          credit.id,
          `credit-approve-${randomUUID()}`,
        );
        const issuedCredit = await creditNotes.issue(
          creator,
          credit.id,
          `credit-issue-${randomUUID()}`,
        );
        expect(issuedCredit.status).toBe("ISSUED");
        expect(issuedCredit.creditNumber).toBe("1");

        const excessCredit = await creditNotes.createDraft(
          creator,
          issued.id,
          `credit-excess-${randomUUID()}`,
          {
            reason: "Excess correction attempt",
            lines: [
              { sourceInvoiceLineId: issued.lines[0].id, quantity: "1.500" },
            ],
          },
        );
        await tx.$executeRaw`SAVEPOINT finance_credit_capacity_check`;
        await expect(
          creditNotes.submitForReview(
            creator,
            excessCredit.id,
            `credit-excess-review-${randomUUID()}`,
          ),
        ).rejects.toBeInstanceOf(ConflictException);
        await tx.$executeRaw`ROLLBACK TO SAVEPOINT finance_credit_capacity_check`;

        await tx.$executeRaw`SAVEPOINT finance_invoice_void_check`;
        await expect(
          invoices.void(reviewer, issued.id, `invoice-void-${randomUUID()}`, {
            reason: "Void attempt after credit",
          }),
        ).rejects.toBeInstanceOf(ConflictException);
        await tx.$executeRaw`ROLLBACK TO SAVEPOINT finance_invoice_void_check`;

        const eventCounts = await Promise.all([
          tx.financeInvoiceEvent.count({ where: { invoiceId: issued.id } }),
          tx.financeCreditNoteEvent.count({
            where: { creditNoteId: credit.id },
          }),
          tx.financeCommandReceipt.count({
            where: { tenantId, orgId, actorUserId: creatorId },
          }),
        ]);
        expect(eventCounts[0]).toBe(5);
        expect(eventCounts[1]).toBe(4);
        expect(eventCounts[2]).toBeGreaterThan(5);
        throw rollbackFixture;
      }),
    ).rejects.toBe(rollbackFixture);
  });
});
