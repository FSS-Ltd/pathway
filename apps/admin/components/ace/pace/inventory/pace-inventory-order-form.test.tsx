import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildAuthHeaders, setApiClientToken } from "@/lib/api-client";
import type { PaceInventoryStockItem } from "@/lib/pace-inventory-api";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/ace/pace/inventory",
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  Node: dom.window.Node,
  Event: dom.window.Event,
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: dom.window.navigator,
});

const stock: PaceInventoryStockItem = {
  child: { id: "child-1", displayName: "Amina Yusuf" },
  subject: { id: "subject-1", name: "Maths" },
  currentPace: 1004,
  futurePaceNumbers: [1005],
  availableCount: 1,
  hasPendingOrder: false,
  stockState: "LOW_STOCK",
  needsAttention: true,
};

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function run(): Promise<void> {
  const { PaceInventoryBulkForm } = await import("./pace-inventory-bulk-form");
  const { createRoot } = await import("react-dom/client");
  const { PaceInventoryWorkspace } = await import("./pace-inventory-workspace");
  const emptyPage = {
    items: [],
    nextCursor: null,
    isLoading: false,
    isLoadingMore: false,
    error: null,
    loadMoreError: null,
    retry: () => undefined,
    loadMore: () => undefined,
  };
  const readOnly = renderToStaticMarkup(
    <PaceInventoryWorkspace
      stock={{ ...emptyPage, items: [stock] }}
      stockView="attention"
      onStockViewChange={() => undefined}
      orders={emptyPage}
    />,
  );
  const manager = renderToStaticMarkup(
    <PaceInventoryWorkspace
      stock={{ ...emptyPage, items: [stock] }}
      stockView="attention"
      onStockViewChange={() => undefined}
      orders={emptyPage}
      orderCreation={{ onCreated: () => undefined }}
    />,
  );
  assert.doesNotMatch(readOnly, /Create order/);
  assert.match(manager, /Create order/);

  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const response = deferred<Response>();
  const requests: Array<{ url: string; init: RequestInit }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    requests.push({ url: String(input), init: init ?? {} });
    return response.promise;
  };
  setApiClientToken("test-token");
  assert.equal(
    new Headers(buildAuthHeaders()).get("Authorization"),
    "Bearer test-token",
  );
  let created = 0;

  try {
    await act(async () =>
      root.render(
        <PaceInventoryWorkspace
          stock={{ ...emptyPage, items: [stock] }}
          stockView="attention"
          onStockViewChange={() => undefined}
          orders={emptyPage}
          orderCreation={{ onCreated: () => undefined }}
        />,
      ),
    );
    await act(async () =>
      [...container.querySelectorAll("button")]
        .find((button) => button.textContent === "Create order")
        ?.click(),
    );
    assert.equal(document.activeElement?.tagName, "FIELDSET");
    await act(async () =>
      [...container.querySelectorAll("button")]
        .find((button) => button.textContent === "Cancel")
        ?.click(),
    );
    assert.equal(document.activeElement?.textContent, "Create order");

    await act(async () =>
      root.render(
        <PaceInventoryBulkForm
          action="order"
          item={stock}
          onCancel={() => undefined}
          onCreated={(count) => {
            created = count;
          }}
        />,
      ),
    );
    const choices = [
      ...container.querySelectorAll<HTMLInputElement>("input[type=checkbox]"),
    ];
    assert.equal(choices.length, 12);
    assert.equal(choices[0].disabled, true);
    await act(async () => choices[1].click());
    assert.match(container.textContent ?? "", /1 selected/);
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>("button[type=submit]")
        ?.click(),
    );
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "http://api.test/ace/pace/inventory/orders");
    assert.equal(requests[0].init.method, "POST");
    assert.equal(
      new Headers(requests[0].init.headers).get("Content-Type"),
      "application/json",
    );
    assert.equal(
      new Headers(requests[0].init.headers).get("Authorization"),
      "Bearer test-token",
    );
    assert.deepEqual(JSON.parse(String(requests[0].init.body)), {
      childId: "child-1",
      subjectId: "subject-1",
      paceNumbers: [1006],
    });
    assert.equal(
      container.querySelector<HTMLButtonElement>("button[type=submit]")
        ?.disabled,
      true,
    );
    await act(async () =>
      response.resolve(
        new Response(
          JSON.stringify({
            batchId: "batch-1",
            orderIds: ["order-1"],
            created: 1,
          }),
          { status: 201 },
        ),
      ),
    );
    assert.equal(created, 1);

    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({ message: "A requested PACE is already on order" }),
        { status: 409 },
      );
    await act(async () =>
      root.render(
        <PaceInventoryBulkForm
          action="order"
          key="conflict"
          item={stock}
          onCancel={() => undefined}
          onCreated={() => assert.fail("Conflicting order must not succeed")}
        />,
      ),
    );
    await act(async () =>
      container
        .querySelectorAll<HTMLInputElement>("input[type=checkbox]")[1]
        .click(),
    );
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>("button[type=submit]")
        ?.click(),
    );
    assert.match(
      container.querySelector('[role="alert"]')?.textContent ?? "",
      /already on order/,
    );
  } finally {
    await act(async () => root.unmount());
    container.remove();
    globalThis.fetch = originalFetch;
    setApiClientToken(null);
  }
}

run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
