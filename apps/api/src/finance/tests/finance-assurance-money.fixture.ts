import { randomUUID } from "node:crypto";
import { FinanceCreditNoteService } from "../finance-credit-note.service";
import type { FinanceAssuranceFixture } from "./finance-assurance.fixture";

export async function createThreeUnitAssuranceInvoice(
  f: FinanceAssuranceFixture,
): Promise<{ invoiceId: string; lineId: string }> {
  const draft = await f.invoices.createDraft(f.actor, randomUUID(), {
    payerAccountId: f.payer.id,
    dueDate: "2026-12-31",
    lines: [
      {
        description: "Three synthetic school charges",
        quantity: "3.000",
        unitAmountMinor: "10000",
        taxRateBasisPoints: 0,
      },
    ],
  });
  await f.invoices.submitForReview(f.actor, draft.id, randomUUID());
  await f.invoices.approve(f.reviewer, draft.id, randomUUID());
  const invoice = await f.invoices.issue(f.actor, draft.id, randomUUID());
  const line = invoice.lines[0];
  if (!line) throw new Error("Missing three-unit invoice line");
  return { invoiceId: invoice.id, lineId: line.id };
}

export async function prepareFiveThousandCredit(
  f: FinanceAssuranceFixture,
  invoiceId: string,
  lineId: string,
): Promise<() => Promise<unknown>> {
  const credits = new FinanceCreditNoteService(f.access, f.commands);
  const credit = await credits.createDraft(f.actor, invoiceId, randomUUID(), {
    reason: "Credit half of one synthetic charge",
    lines: [{ sourceInvoiceLineId: lineId, quantity: "0.500" }],
  });
  await credits.submitForReview(f.actor, credit.id, randomUUID());
  await credits.approve(f.reviewer, credit.id, randomUUID());
  const key = randomUUID();
  return () => credits.issue(f.actor, credit.id, key);
}

export async function createApprovedAssuranceManualReceipt(
  f: FinanceAssuranceFixture,
  amountMinor: string,
): Promise<string> {
  const request = await f.manualReceipts.createRequest(f.actor, randomUUID(), {
    payerAccountId: f.payer.id,
    bankTransactionReference: `ASSURANCE-${randomUUID()}`,
    amountMinor,
    receivedAt: new Date(Date.now() - 1000).toISOString(),
    reason: "Synthetic independently matched bank evidence",
  });
  const approved = await f.manualReceipts.approveRequest(
    f.reviewer,
    request.id,
    randomUUID(),
  );
  if (!approved.receiptId)
    throw new Error("Manual approval did not create a receipt");
  return approved.receiptId;
}

export function assuranceGate(): {
  promise: Promise<void>;
  release: () => void;
} {
  let release = () => {};
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
