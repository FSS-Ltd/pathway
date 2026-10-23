import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { FinanceOperationsWorkspace } from "./operations-workspace";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/finance",
});
Object.assign(globalThis, {
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
const record = {
  id: randomUUID(),
  kind: "UNMATCHED_MONEY",
  status: "OPEN",
  resourceReference: "pi_synthetic",
  amountMinor: "12500",
  currency: "GBP",
  details: { reason: "unmatched_confirmed_payment" },
  lastSeenAt: "2026-10-23T12:00:00Z",
  createdAt: "2026-10-23T12:00:00Z",
  connection: {
    id: randomUUID(),
    accountId: "acct_synthetic",
    mode: "TEST",
    status: "READY",
    disconnectedAt: null,
    legalEntityName: "Synthetic school",
  },
};
function click(container: Element, label: string) {
  const button = Array.from(container.querySelectorAll("button")).find(
    (candidate) => candidate.textContent?.includes(label),
  );
  assert.ok(button, `Missing ${label}`);
  button.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
}
async function run() {
  const { createRoot } = await import("react-dom/client");
  const container = document.body.appendChild(document.createElement("div"));
  const root = createRoot(container);
  const originalFetch = globalThis.fetch;
  let mode: "ready" | "conflict" | "denied" = "ready";
  const actions: Array<{ url: string; body: Record<string, unknown> }> = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (mode === "denied")
      return Response.json({ message: "Permission revoked" }, { status: 403 });
    if (init?.method === "POST") {
      actions.push({ url, body: JSON.parse(String(init.body)) });
      if (mode === "conflict")
        return Response.json({ message: "Case changed" }, { status: 409 });
      return Response.json({ status: "REQUESTED" });
    }
    if (url.endsWith(record.id))
      return Response.json({
        ...record,
        coverage: [],
        events: [],
        evidence: [],
      });
    return Response.json({ items: [record], nextCursor: null });
  };
  try {
    await act(async () =>
      root.render(<FinanceOperationsWorkspace canManage />),
    );
    const currencies = Array.from(container.querySelectorAll("select")).find(
      (select) => select.textContent?.includes("All currencies"),
    );
    assert.ok(currencies);
    for (const currency of [
      "GBP",
      "EUR",
      "CZK",
      "DKK",
      "HUF",
      "PLN",
      "RON",
      "SEK",
    ])
      assert.ok(
        Array.from(currencies.options).some(
          (option) => option.value === currency,
        ),
        `Missing supported currency ${currency}`,
      );
    assert.match(container.textContent ?? "", /UNMATCHED MONEY/);
    await act(async () => click(container, "UNMATCHED MONEY"));
    assert.match(container.textContent ?? "", /acct_synthetic/);
    assert.match(
      container.textContent ?? "",
      /Coverage has not been established/,
    );
    await act(async () => click(container, "Request recheck"));
    assert.equal(actions.length, 0, "Confirmation must precede a request");
    const textarea = container.querySelector("textarea");
    assert.ok(textarea);
    const setValue = Object.getOwnPropertyDescriptor(
      dom.window.HTMLTextAreaElement.prototype,
      "value",
    )?.set;
    await act(async () => {
      setValue?.call(textarea, "Reviewed stored evidence");
      textarea.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
    const form = container.querySelector("form");
    assert.ok(form);
    mode = "conflict";
    await act(async () =>
      form.dispatchEvent(
        new dom.window.Event("submit", { bubbles: true, cancelable: true }),
      ),
    );
    assert.match(container.textContent ?? "", /Evidence changed/);
    const firstId = actions[0]?.body.requestId;
    await act(async () =>
      form.dispatchEvent(
        new dom.window.Event("submit", { bubbles: true, cancelable: true }),
      ),
    );
    assert.equal(
      actions[1]?.body.requestId,
      firstId,
      "Retries must preserve request identity",
    );
    mode = "denied";
    await act(async () => click(container, "Refresh cases"));
    assert.match(container.textContent ?? "", /Finance access changed/);
    assert.doesNotMatch(container.textContent ?? "", /acct_synthetic/);
  } finally {
    globalThis.fetch = originalFetch;
    await act(async () => root.unmount());
    dom.window.close();
  }
}
void run();
