import { randomUUID } from "node:crypto";
import { withTenantRlsContext } from "@pathway/db";
import { requireDatabase } from "../../../test-helpers.e2e";
import { lockInvoice } from "../finance-invoice-operations";
import { lockReceipt } from "../finance-receipt-operations";
import { recordFinanceReceiptMovement } from "../finance-receipt-movement.service";
import {
  confirmedReceiptUnapplied,
  financeReceiptInclude,
} from "../finance-receipt-records";
import { createFinanceAssuranceFixture } from "./finance-assurance.fixture";
import { prepareAssuranceProviderSuccess } from "./finance-assurance-provider.fixture";
import {
  assuranceGate,
  createThreeUnitAssuranceInvoice,
  prepareFiveThousandCredit,
} from "./finance-assurance-money.fixture";

describe("Finance reinstatement transaction ordering assurance", () => {
  beforeAll(() => {
    if (!requireDatabase())
      throw new Error("Central disposable database required");
  });

  it.each(["credit-first", "return-first", "replacement-receipt"] as const)(
    "preserves visible funds with concurrent %s",
    async (ordering) => {
      const f = await createFinanceAssuranceFixture();
      const { invoiceId, lineId } = await createThreeUnitAssuranceInvoice(f);
      await (
        await prepareAssuranceProviderSuccess(f, invoiceId, "card", 30000)
      )();
      const scope = { tenantId: f.tenantId, orgId: f.orgId };
      const receipt = await withTenantRlsContext(f.tenantId, f.orgId, (tx) =>
        tx.financeReceipt.findFirstOrThrow({
          where: { ...scope, payerAccountId: f.payer.id },
        }),
      );
      const common = {
        ...scope,
        financeProfileId: f.profile.id,
        receiptId: receipt.id,
        amountMinor: 30000n,
        currency: "GBP" as const,
        source: "STRIPE" as const,
        occurredAt: new Date(),
      };
      const withdrawal = await withTenantRlsContext(
        f.tenantId,
        f.orgId,
        async (tx) => {
          await lockReceipt(tx, f.actor, receipt.id);
          return recordFinanceReceiptMovement(tx, {
            ...common,
            type: "DISPUTE_WITHDRAWAL",
            sourceReference: `du_${randomUUID()}`,
          });
        },
      );
      const restoreInput = {
        ...common,
        type: "DISPUTE_REINSTATEMENT" as const,
        originalMovementId: withdrawal.id,
        sourceReference: `txn_${randomUUID()}`,
      };
      const restore = () =>
        withTenantRlsContext(f.tenantId, f.orgId, async (tx) => {
          await lockReceipt(tx, f.actor, receipt.id);
          return recordFinanceReceiptMovement(tx, restoreInput);
        });
      if (ordering === "replacement-receipt") {
        const replacement = await prepareAssuranceProviderSuccess(
          f,
          invoiceId,
          "card",
          10000,
        );
        await Promise.all([restore(), replacement()]);
        await replacement();
      } else {
        const credit = await prepareFiveThousandCredit(f, invoiceId, lineId);
        const held = assuranceGate();
        const release = assuranceGate();
        // Only the first operation inherits this transaction. The contender starts
        // from the root context while the invoice row remains locked.
        const first = withTenantRlsContext(f.tenantId, f.orgId, async (tx) => {
          if (ordering === "return-first")
            await lockReceipt(tx, f.actor, receipt.id);
          await lockInvoice(tx, f.actor, invoiceId);
          held.release();
          await release.promise;
          return ordering === "credit-first"
            ? credit()
            : recordFinanceReceiptMovement(tx, restoreInput);
        });
        await Promise.race([held.promise, first]);
        const second = ordering === "credit-first" ? restore() : credit();
        release.release();
        await Promise.all([first, second]);
        await credit();
      }
      await restore();
      const balance = (await f.invoices.get(f.actor, invoiceId)).balance;
      expect(balance.outstandingMinor).toBe("0");
      const unapplied = await withTenantRlsContext(
        f.tenantId,
        f.orgId,
        async (tx) => {
          const receipts = await tx.financeReceipt.findMany({
            where: { ...scope, payerAccountId: f.payer.id },
            include: financeReceiptInclude,
          });
          expect(receipts).toHaveLength(
            ordering === "replacement-receipt" ? 2 : 1,
          );
          expect(
            await tx.financeReceiptMovement.count({
              where: { ...scope, receiptId: receipt.id },
            }),
          ).toBe(2);
          return receipts.reduce(
            (sum, row) => sum + confirmedReceiptUnapplied(row),
            0n,
          );
        },
      );
      if (ordering === "replacement-receipt") {
        expect(balance.allocatedReceiptsMinor).toBe("30000");
        expect(balance.creditBalanceMinor).toBe("0");
        expect(unapplied).toBe(10000n);
      } else {
        expect(balance.issuedCreditsMinor).toBe("5000");
        expect(balance.allocatedReceiptsMinor).toBe(
          ordering === "credit-first" ? "25000" : "30000",
        );
        expect(balance.creditBalanceMinor).toBe(
          ordering === "credit-first" ? "0" : "5000",
        );
        expect(unapplied + BigInt(balance.creditBalanceMinor)).toBe(5000n);
      }
    },
  );
});
