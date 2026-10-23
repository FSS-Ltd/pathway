import { ConflictException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { withTenantRlsContext } from "@pathway/db";
import { requireDatabase } from "../../../test-helpers.e2e";
import { FinanceRecurringInvoiceService } from "../finance-recurring-invoice.service";
import { createFinanceAssuranceFixture } from "./finance-assurance.fixture";
import { prepareAssuranceProviderSuccess } from "./finance-assurance-provider.fixture";

describe("Finance mixed transaction assurance", () => {
  it.each(["card", "bacs"] as const)(
    "preserves excess when independent manual approval overlaps %s success and parallel replay",
    async (method) => {
      if (!requireDatabase()) return;
      const f = await createFinanceAssuranceFixture();
      const invoiceId = await f.createIssuedInvoice("500");
      const success = await prepareAssuranceProviderSuccess(
        f,
        invoiceId,
        method,
        500,
      );
      const request = await f.manualReceipts.createRequest(
        f.actor,
        randomUUID(),
        {
          payerAccountId: f.payer.id,
          bankTransactionReference: `ASSURANCE-${randomUUID()}`,
          amountMinor: "200",
          receivedAt: new Date(Date.now() - 1000).toISOString(),
          reason: "Synthetic independently reviewed bank evidence",
        },
      );
      await expect(
        f.manualReceipts.approveRequest(f.actor, request.id, randomUUID()),
      ).rejects.toThrow("Independent approval required");
      const approvalKey = randomUUID();
      // These promises start outside an enclosing transaction. Approval and canonical
      // provider processing therefore use independent database transactions.
      const [approval, first, duplicate] = await Promise.all([
        (async () => {
          const approved = await f.manualReceipts.approveRequest(
            f.reviewer,
            request.id,
            approvalKey,
          );
          if (!approved.receiptId)
            throw new Error("Manual approval did not create receipt");
          try {
            await f.receipts.allocate(
              f.actor,
              approved.receiptId,
              randomUUID(),
              { invoiceId, amountMinor: "200" },
            );
          } catch (error) {
            if (!(error instanceof ConflictException)) throw error;
          }
          return approved;
        })(),
        success(),
        success(),
      ]);
      expect([first, duplicate]).toEqual(["processed", "processed"]);
      expect(approval.status).toBe("APPROVED");
      expect(approval.receiptId).toBeTruthy();
      expect(
        (
          await f.manualReceipts.approveRequest(
            f.reviewer,
            request.id,
            approvalKey,
          )
        ).receiptId,
      ).toBe(approval.receiptId);
      if (!approval.receiptId)
        throw new Error("Manual approval did not create receipt");
      const balance = (await f.invoices.get(f.actor, invoiceId)).balance;
      expect(balance).toMatchObject({
        outstandingMinor: "0",
        allocatedReceiptsMinor: "500",
        creditBalanceMinor: "0",
      });
      await withTenantRlsContext(f.tenantId, f.orgId, async (tx) => {
        const receipts = await tx.financeReceipt.findMany({
          where: {
            tenantId: f.tenantId,
            orgId: f.orgId,
            payerAccountId: f.payer.id,
          },
          select: {
            amountMinor: true,
            status: true,
            allocations: { select: { amountMinor: true } },
          },
        });
        expect(receipts).toHaveLength(2);
        expect(
          receipts.every((receipt) => receipt.status === "CONFIRMED"),
        ).toBe(true);
        expect(
          receipts.reduce((sum, receipt) => sum + receipt.amountMinor, 0n),
        ).toBe(700n);
        expect(
          receipts.reduce(
            (sum, receipt) =>
              sum +
              receipt.amountMinor -
              receipt.allocations.reduce(
                (allocated, allocation) => allocated + allocation.amountMinor,
                0n,
              ),
            0n,
          ),
        ).toBe(200n);
      });
    },
  );

  it("issues concurrent reviewed invoices with distinct consecutive legal numbers and stable replay", async () => {
    if (!requireDatabase()) return;
    const f = await createFinanceAssuranceFixture();
    const ids = await Promise.all([
      f.createReviewedInvoice("100"),
      f.createReviewedInvoice("200"),
    ]);
    const keys = [randomUUID(), randomUUID()];
    const keyAt = (index: number): string => {
      const key = keys[index];
      if (!key) throw new Error("Missing invoice command key");
      return key;
    };
    const issued = await Promise.all(
      ids.map((id, index) => f.invoices.issue(f.actor, id, keyAt(index))),
    );
    const numbers = issued
      .map((invoice) => BigInt(invoice.invoiceNumber ?? "0"))
      .sort((a, b) => (a < b ? -1 : 1));
    expect(numbers[0]).toBe(1n);
    expect(numbers[1]).toBe(2n);
    const replayed = await Promise.all(
      ids.map((id, index) => f.invoices.issue(f.actor, id, keyAt(index))),
    );
    expect(replayed.map((invoice) => invoice.invoiceNumber)).toEqual(
      issued.map((invoice) => invoice.invoiceNumber),
    );
  });
  it("generates one recurring invoice per period across simultaneous runs and restart", async () => {
    if (!requireDatabase()) return;
    const f = await createFinanceAssuranceFixture();
    const service = new FinanceRecurringInvoiceService(f.access);
    const template = await service.createTemplate(f.actor, {
      payerAccountId: f.payer.id,
      firstPeriodStart: "2026-10-01",
      dayOfMonth: 15,
      dueDays: 14,
      lines: [
        {
          description: "Synthetic monthly fee",
          quantity: "1",
          unitAmountMinor: "1000",
          taxRateBasisPoints: 0,
        },
      ],
    });
    const asOf = new Date("2026-10-23T12:00:00Z");
    const results = await Promise.all([
      service.generateDueForScope(f.actor, asOf),
      service.generateDueForScope(f.actor, asOf),
    ]);
    expect(results.reduce((sum, result) => sum + result.generated, 0)).toBe(1);
    expect(
      (
        await new FinanceRecurringInvoiceService(f.access).generateDueForScope(
          f.actor,
          asOf,
        )
      ).generated,
    ).toBe(0);
    await withTenantRlsContext(f.tenantId, f.orgId, async (tx) => {
      expect(
        await tx.financeInvoice.count({
          where: {
            tenantId: f.tenantId,
            orgId: f.orgId,
            recurringTemplateId: template.templateId,
          },
        }),
      ).toBe(1);
    });
  });
});
