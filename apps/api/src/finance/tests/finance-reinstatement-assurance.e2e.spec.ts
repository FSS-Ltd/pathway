import { randomUUID } from "node:crypto";
import { withTenantRlsContext } from "@pathway/db";
import { requireDatabase } from "../../../test-helpers.e2e";
import { recordFinanceReceiptMovement } from "../finance-receipt-movement.service";
import { lockReceipt } from "../finance-receipt-operations";
import {
  confirmedReceiptUnapplied,
  financeReceiptInclude,
} from "../finance-receipt-records";
import { createFinanceAssuranceFixture } from "./finance-assurance.fixture";
import { prepareAssuranceProviderSuccess } from "./finance-assurance-provider.fixture";

describe("returned principal after replacement payment (A18)", () => {
  beforeAll(() => {
    if (!requireDatabase()) throw new Error("Disposable database required");
  });

  it.each([30_000, 10_000])(
    "leaves the excess unapplied after a replacement receipt of %i minor units",
    async (replacementMinor) => {
      const f = await createFinanceAssuranceFixture();
      const invoiceId = await f.createIssuedInvoice("30000");
      await (
        await prepareAssuranceProviderSuccess(f, invoiceId, "card", 30_000)
      )();
      const originalReceipt = await withTenantRlsContext(
        f.tenantId,
        f.orgId,
        (tx) =>
          tx.financeReceipt.findFirstOrThrow({
            where: {
              tenantId: f.tenantId,
              orgId: f.orgId,
              payerAccountId: f.payer.id,
            },
          }),
      );
      const common = {
        tenantId: f.tenantId,
        orgId: f.orgId,
        financeProfileId: f.profile.id,
        receiptId: originalReceipt.id,
        amountMinor: 30_000n,
        currency: "GBP" as const,
        source: "STRIPE" as const,
        occurredAt: new Date(),
      };
      const withdrawal = await withTenantRlsContext(
        f.tenantId,
        f.orgId,
        async (tx) => {
          await lockReceipt(tx, f.actor, originalReceipt.id);
          return recordFinanceReceiptMovement(tx, {
            ...common,
            type: "DISPUTE_WITHDRAWAL",
            sourceReference: `du_${randomUUID().replaceAll("-", "")}`,
          });
        },
      );
      await (
        await prepareAssuranceProviderSuccess(
          f,
          invoiceId,
          "card",
          replacementMinor,
        )
      )();
      const restore = {
        ...common,
        type: "DISPUTE_REINSTATEMENT" as const,
        originalMovementId: withdrawal.id,
        sourceReference: `txn_${randomUUID().replaceAll("-", "")}`,
      };
      await withTenantRlsContext(f.tenantId, f.orgId, async (tx) => {
        await lockReceipt(tx, f.actor, originalReceipt.id);
        const result = await recordFinanceReceiptMovement(tx, restore);
        expect(result.appliedMinor.toString()).toBe(
          String(30_000 - replacementMinor),
        );
        expect(await recordFinanceReceiptMovement(tx, restore)).toEqual({
          ...result,
          duplicate: true,
        });
        const invoice = await tx.financeInvoice.findFirstOrThrow({
          where: { id: invoiceId, tenantId: f.tenantId, orgId: f.orgId },
        });
        const balance = (
          await f.balances.forInvoices(tx, f.actor, [invoice])
        ).get(invoiceId);
        expect(balance).toMatchObject({
          allocatedReceiptsMinor: "30000",
          outstandingMinor: "0",
          creditBalanceMinor: "0",
        });
        const receipt = await tx.financeReceipt.findFirstOrThrow({
          where: {
            id: originalReceipt.id,
            tenantId: f.tenantId,
            orgId: f.orgId,
          },
          include: financeReceiptInclude,
        });
        expect(confirmedReceiptUnapplied(receipt).toString()).toBe(
          String(replacementMinor),
        );
      });
    },
  );
});
