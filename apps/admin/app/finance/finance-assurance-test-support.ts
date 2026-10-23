import React from "react";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { JSDOM } from "jsdom";

export const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/finance",
});
Object.assign(globalThis, {
  React,
  window: dom.window,
  self: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  Event: dom.window.Event,
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  configurable: true,
});
Object.defineProperty(globalThis, "crypto", {
  value: { randomUUID },
  configurable: true,
});
Object.assign(dom.window.HTMLDialogElement.prototype, {
  showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  },
  close(this: HTMLDialogElement) {
    this.removeAttribute("open");
  },
});
export function click(container: Element, label: string): void {
  const button = Array.from(container.querySelectorAll("button")).find(
    (item) => item.textContent?.trim() === label,
  );
  assert.ok(button, `Missing button: ${label}`);
  button.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
}
export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
export const invoice = {
  id: randomUUID(),
  payerAccountId: randomUUID(),
  payerName: "Synthetic family",
  invoiceNumber: null,
  status: "IN_REVIEW" as const,
  currency: "GBP",
  subtotalMinor: "10000",
  taxMinor: "2000",
  totalMinor: "12000",
  balance: {
    outstandingMinor: "12000",
    issuedCreditsMinor: "0",
    allocatedReceiptsMinor: "0",
  },
  dueDate: "2026-11-01",
  issuedAt: null,
  approvedAt: "2026-10-22T12:00:00Z",
  createdAt: "2026-10-21T12:00:00Z",
  updatedAt: "2026-10-22T12:00:00Z",
  legalEntityNameSnapshot: null,
  legalEntityName: "Fresh school legal entity",
  reviewRevision: "a".repeat(64),
  payerNameSnapshot: null,
  lines: [
    {
      id: randomUUID(),
      lineOrder: 0,
      description: "Autumn tuition",
      quantity: "2",
      unitAmountMinor: "5000",
      taxRateBasisPoints: 2000,
      netAmountMinor: "10000",
      taxAmountMinor: "2000",
      totalMinor: "12000",
    },
  ],
};
export const metadata = {
  from: "2026-10-01",
  to: "2026-10-23",
  asOfDate: "2026-10-23",
  timeZone: "Europe/London",
  generatedAt: "2026-10-23T12:00:00Z",
  ledgerCutoffAt: "2026-10-23T12:00:00Z",
  currency: "GBP",
  legalEntityName: "Synthetic school",
  reportingBasis: "Invoice issue date",
};
export const summary = {
  metadata,
  totals: null,
  accessMode: "ACTIVE",
  provider: {
    status: "NOT_CONNECTED",
    fetchedAt: null,
    source: "PERSISTED_RECONCILIATION",
    context: null,
    freshness: "NOT_SYNCED",
    periodStartCoverage: "UNPROVEN",
    truncated: false,
    coverage: [],
    feesByCurrency: [],
    payouts: [],
  },
};
