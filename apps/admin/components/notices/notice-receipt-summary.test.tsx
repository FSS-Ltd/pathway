import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { setApiClientToken } from "@/lib/api-client";
import { NoticeReceiptSummary } from "./notice-receipt-summary";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/notices/notice-a",
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

async function run() {
  const { createRoot } = await import("react-dom/client");
  const container = document.body.appendChild(document.createElement("div"));
  const root = createRoot(container);
  const originalFetch = globalThis.fetch;
  let fail = false;
  setApiClientToken("receipt-token");
  globalThis.fetch = async (input, init) => {
    assert.equal(
      String(input),
      "http://api.test/ace/notices/notice-a/receipts",
    );
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      "Bearer receipt-token",
    );
    if (fail) return new Response("", { status: 503 });
    return Response.json({
      recipientCount: 3,
      deliveredCount: 3,
      readCount: 2,
      acknowledgedCount: 1,
      requiresAcknowledgement: true,
    });
  };

  try {
    await act(async () =>
      root.render(<NoticeReceiptSummary noticeId="notice-a" />),
    );
    assert.match(container.textContent ?? "", /Delivered in app/);
    assert.match(container.textContent ?? "", /Read/);
    assert.match(container.textContent ?? "", /Acknowledged/);
    assert.match(container.textContent ?? "", /recipient snapshot/);

    fail = true;
    const refresh = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Refresh totals"),
    );
    assert.ok(refresh);
    await act(async () =>
      refresh.dispatchEvent(
        new dom.window.MouseEvent("click", { bubbles: true }),
      ),
    );
    assert.match(container.textContent ?? "", /Unable to load receipt totals/);
    assert.doesNotMatch(container.textContent ?? "", /Delivered in app/);

    fail = false;
    const retry = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Retry"),
    );
    assert.ok(retry);
    await act(async () =>
      retry.dispatchEvent(
        new dom.window.MouseEvent("click", { bubbles: true }),
      ),
    );
    assert.match(container.textContent ?? "", /Delivered in app/);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = originalFetch;
    setApiClientToken(null);
    container.remove();
  }
}

void run();
