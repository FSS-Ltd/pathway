import assert from "node:assert/strict";
import React, { act } from "react";
import {
  dom,
  click,
  deferred,
  metadata,
} from "./finance-assurance-test-support";
import { FinanceReportWorkspace } from "./report-workspace";

async function run() {
  const { createRoot } = await import("react-dom/client");
  const container = document.body.appendChild(document.createElement("div"));
  const root = createRoot(container);
  const originalFetch = globalThis.fetch;
  const pending = deferred<Response>();
  const exported = deferred<Response>();
  const requests: string[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    requests.push(url);
    if (url.includes("/export?")) return exported.promise;
    if (url.includes("/exceptions?"))
      return Response.json({
        type: "exceptions",
        metadata,
        totals: null,
        rows: [],
      });
    return pending.promise;
  };
  try {
    await act(async () =>
      root.render(
        <FinanceReportWorkspace
          canExport
          initialFilters={{
            from: metadata.from,
            to: metadata.to,
            asOf: metadata.asOfDate,
          }}
        />,
      ),
    );
    assert.equal(
      Array.from(container.querySelectorAll("button")).find(
        (button) => button.textContent === "Export CSV",
      )?.disabled,
      true,
      "Export requires a current report",
    );
    await act(async () => click(container, "Run report"));
    const select = container.querySelector("select");
    assert.ok(select);
    await act(async () => {
      select.value = "exceptions";
      select.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    });
    await act(async () =>
      pending.resolve(
        Response.json({
          type: "receivables-ageing",
          metadata,
          totals: null,
          rows: [
            {
              recordType: "invoice",
              reference: "STALE-ROW",
              date: null,
              payerName: null,
              status: "ISSUED",
              amountMinor: "100",
              currency: "GBP",
              description: "Old selection",
              dueDate: null,
              outstandingMinor: "100",
              ageingBucket: null,
              overdueDays: null,
              feeMinor: null,
              payoutStatus: null,
            },
          ],
        }),
      ),
    );
    assert.doesNotMatch(
      container.textContent ?? "",
      /STALE-ROW/,
      "Old response must not repopulate changed report selection",
    );
    await act(async () => click(container, "Run report"));
    await act(async () => click(container, "Export CSV"));
    assert.equal(
      requests.at(-1),
      `http://api.test/finance/reports/exceptions/export?from=${metadata.from}&to=${metadata.to}&asOf=${metadata.asOfDate}`,
    );
    assert.equal(
      select.disabled,
      true,
      "Freeze report selection until export finishes",
    );
    assert.ok(
      Array.from(container.querySelectorAll('input[type="date"]')).every(
        (input) =>
          input instanceof dom.window.HTMLInputElement && input.disabled,
      ),
    );
    await act(async () => exported.resolve(Response.json({}, { status: 403 })));
    assert.match(
      container.textContent ?? "",
      /Finance export could not be created/,
    );
    assert.equal(
      Array.from(container.querySelectorAll("button")).find(
        (button) => button.textContent === "Export CSV",
      )?.disabled,
      true,
      "Denied export discards its report",
    );
  } finally {
    await act(async () => root.unmount());
    container.remove();
    globalThis.fetch = originalFetch;
    dom.window.close();
  }
}
void run();
