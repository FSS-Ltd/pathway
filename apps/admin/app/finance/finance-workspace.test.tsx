import assert from "node:assert/strict";
import React, { act } from "react";
import {
  dom,
  click,
  deferred,
  invoice,
  summary,
} from "./finance-assurance-test-support";
import { FinanceWorkspace } from "./finance-workspace";

async function run() {
  const { createRoot } = await import("react-dom/client");
  const container = document.body.appendChild(document.createElement("div"));
  const root = createRoot(container);
  const originalFetch = globalThis.fetch;
  let denied = false;
  const late = deferred<Response>();
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("cursor=")) return late.promise;
    if (denied)
      return Response.json({ message: "Permission revoked" }, { status: 403 });
    if (url.includes("reports/summary")) return Response.json(summary);
    if (url.includes("/invoices?"))
      return Response.json({ items: [invoice], nextCursor: invoice.id });
    return Response.json({ items: [], nextCursor: null });
  };
  try {
    await act(async () =>
      root.render(
        <FinanceWorkspace
          canCreateInvoices
          canManageAllocations
          canReviewInvoices
          canExport
          canReadStatements
          canReadSettings
          showUpgradeIfLocked={false}
        />,
      ),
    );
    await act(async () => click(container, "Invoices"));
    assert.match(container.textContent ?? "", /Synthetic family/);
    await act(async () => click(container, "Load more invoices"));
    denied = true;
    await act(async () => click(container, "Refresh"));
    assert.doesNotMatch(
      container.textContent ?? "",
      /Synthetic family/,
      "Denied refresh must discard protected records",
    );
    await act(async () =>
      late.resolve(
        Response.json({
          items: [
            {
              ...invoice,
              id: crypto.randomUUID(),
              payerName: "Late protected family",
            },
          ],
          nextCursor: null,
        }),
      ),
    );
    assert.doesNotMatch(
      container.textContent ?? "",
      /Late protected family|Synthetic family/,
      "Older in-flight reads must not restore protected records",
    );
  } finally {
    await act(async () => root.unmount());
    container.remove();
    globalThis.fetch = originalFetch;
    dom.window.close();
  }
}
void run();
