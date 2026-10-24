import { renderFinancePdf } from "../src/finance/finance-document-pdf";
import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";

const payerName = "Łukasz Żółć · Ștefan Țicu · Ελένη · Живко";

const pdf = await renderFinancePdf({
  title: "Family statement",
  legalEntityName: "NexSteps School",
  payerName,
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

// Inspect the rendered document's Unicode maps, rather than only the input or
// font registration. Standard PDF fonts silently replace unsupported glyphs.
const unicodeMaps = Array.from(
  pdf.toString("latin1").matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g),
  (match) => inflateSync(Buffer.from(match[1], "latin1")).toString("utf8"),
).filter((stream) => stream.includes("begincmap"));
assert.ok(unicodeMaps.length > 0, "Finance PDF must embed Unicode text maps");
for (const character of Array.from(new Set(payerName))) {
  if (character.charCodeAt(0) < 0x100) continue;
  const codePoint = character.charCodeAt(0).toString(16).padStart(4, "0");
  const mapping = new RegExp(`^<[0-9a-f]+><${codePoint}>$`, "mi");
  assert.ok(
    unicodeMaps.some((map) => mapping.test(map)),
    `Finance PDF lost the payer name character ${character}`,
  );
}

// Screen readers need a document language and a title shown by the viewer.
// The renderer's labels are English, so the declared language must be too.
const raw = pdf.toString("latin1");
assert.match(raw, /\/Lang \(en-GB\)/, "Finance PDF must declare its language");
assert.match(raw, /\/DisplayDocTitle true/, "Finance PDF must show its title");
