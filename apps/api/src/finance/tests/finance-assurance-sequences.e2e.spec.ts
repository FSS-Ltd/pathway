import { randomUUID } from "node:crypto";
import { withTenantRlsContext } from "@pathway/db";
import { requireDatabase } from "../../../test-helpers.e2e";
import { FinanceCreditNoteService } from "../finance-credit-note.service";
import { recordFinanceReceiptMovement } from "../finance-receipt-movement.service";
import { createFinanceAssuranceFixture } from "./finance-assurance.fixture";
import { prepareAssuranceProviderSuccess } from "./finance-assurance-provider.fixture";

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
}

describe("Finance deterministic generated ledger sequences", () => {
  it.each([7, 108, 65537])(
    "rebuilds payment/credit/refund projections and ignores repeated evidence for seed %i",
    async (seed) => {
      if (!requireDatabase()) return;
      const f = await createFinanceAssuranceFixture();
      const invoiceId = await f.createIssuedInvoice("100000");
      const invoice = await f.invoices.get(f.actor, invoiceId);
      const line = invoice.lines[0];
      if (!line) throw new Error("Missing synthetic invoice line");
      const credits = new FinanceCreditNoteService(f.access, f.commands);
      const next = seededRandom(seed);
      let paid = 0n;
      let refunded = 0n;
      let credited = 0n;
      const replays: Array<() => Promise<unknown>> = [];
      for (let index = 0; index < 12; index++) {
        // Values are generated independently from the implementation projections.
        const amount = 100 + (next() % 801);
        const pay = await prepareAssuranceProviderSuccess(
          f,
          invoiceId,
          "card",
          amount,
        );
        await pay();
        paid += BigInt(amount);
        replays.push(pay);
        if (next() % 2 === 0) {
          const credit = await credits.createDraft(
            f.actor,
            invoiceId,
            randomUUID(),
            {
              reason: "Synthetic generated credit",
              lines: [{ sourceInvoiceLineId: line.id, quantity: "0.001" }],
            },
          );
          await credits.submitForReview(f.actor, credit.id, randomUUID());
          await credits.approve(f.reviewer, credit.id, randomUUID());
          const key = randomUUID();
          await credits.issue(f.actor, credit.id, key);
          credited += 100n;
          replays.push(() => credits.issue(f.actor, credit.id, key));
        }
        const refundAmount = BigInt(1 + (next() % amount));
        const receipt = await withTenantRlsContext(f.tenantId, f.orgId, (tx) =>
          tx.financeReceipt.findFirstOrThrow({
            where: {
              tenantId: f.tenantId,
              orgId: f.orgId,
              payerAccountId: f.payer.id,
              source: "STRIPE_CARD",
              movements: { none: {} },
            },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          }),
        );
        const input = {
          financeProfileId: f.profile.id,
          receiptId: receipt.id,
          tenantId: f.tenantId,
          orgId: f.orgId,
          type: "REFUND" as const,
          source: "STRIPE" as const,
          amountMinor: refundAmount,
          currency: "GBP" as const,
          sourceReference: `re_${randomUUID().replaceAll("-", "")}`,
          occurredAt: new Date(),
        };
        const refund = () =>
          withTenantRlsContext(f.tenantId, f.orgId, (tx) =>
            recordFinanceReceiptMovement(tx, input),
          );
        await refund();
        refunded += refundAmount;
        replays.push(refund);
        const expectedAllocated = paid - refunded;
        expect(
          (await f.invoices.get(f.actor, invoiceId)).balance,
        ).toMatchObject({
          issuedGrossMinor: "100000",
          issuedCreditsMinor: credited.toString(),
          allocatedReceiptsMinor: expectedAllocated.toString(),
          outstandingMinor: (100000n - credited - expectedAllocated).toString(),
          creditBalanceMinor: "0",
        });
        // Repeating every operation tests canonical posting, command identity and
        // rebuilding the persisted projection after each generated prefix.
        for (const replay of replays) await replay();
        expect(
          (await f.invoices.get(f.actor, invoiceId)).balance.outstandingMinor,
        ).toBe((100000n - credited - expectedAllocated).toString());
      }
      await withTenantRlsContext(f.tenantId, f.orgId, async (tx) => {
        const scope = { tenantId: f.tenantId, orgId: f.orgId };
        expect(
          await tx.financeReceipt.count({
            where: { ...scope, payerAccountId: f.payer.id },
          }),
        ).toBe(12);
        expect(
          await tx.financeReceiptMovement.count({
            where: {
              ...scope,
              receipt: { is: { payerAccountId: f.payer.id } },
            },
          }),
        ).toBe(12);
        const reconstructed = await f.balances.forInvoices(tx, f.actor, [
          { id: invoiceId, status: "ISSUED", totalMinor: 100000n },
        ]);
        expect(reconstructed.get(invoiceId)?.outstandingMinor).toBe(
          (100000n - credited - paid + refunded).toString(),
        );
      });
    },
  );
});
