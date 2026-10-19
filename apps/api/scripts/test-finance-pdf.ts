import { renderFinancePdf } from "../src/finance/finance-document-pdf";

const pdf = await renderFinancePdf({
  title: "Family statement",
  legalEntityName: "NexSteps School",
  payerName: "Family account",
  reference: "Statement · 2026-09",
  generatedAt: "2026-10-01T08:00:00.000Z",
  ledgerCutoffAt: "2026-10-01T08:00:00.000Z",
  currency: "GBP",
  totals: [
    { label: "Opening balance", amountMinor: "1200" },
    { label: "Closing balance", amountMinor: "1200", emphasized: true },
  ],
  lines: [],
});

if (!Buffer.isBuffer(pdf) || pdf.subarray(0, 5).toString("ascii") !== "%PDF-") {
  throw new Error("Finance document renderer did not produce a PDF");
}
if (pdf.byteLength < 500) {
  throw new Error(
    `Finance PDF is unexpectedly small (${pdf.byteLength} bytes)`,
  );
}
