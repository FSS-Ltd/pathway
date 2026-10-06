import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { setApiClientToken } from "@/lib/api-client";
import { notifyActiveSiteChanged } from "@/lib/active-site-events";
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
  const { PaceInventoryWorkspace } = await import("./pace-inventory-workspace");
  const { createRoot } = await import("react-dom/client");
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
  const workspace = (canManage: boolean) =>
    renderToStaticMarkup(
      <PaceInventoryWorkspace
        stock={{ ...emptyPage, items: [stock] }}
        stockView="attention"
        onStockViewChange={() => undefined}
        orders={emptyPage}
        stockEntry={canManage ? { onCreated: () => undefined } : undefined}
      />,
    );
  assert.doesNotMatch(workspace(false), /Add stock/);
  assert.match(workspace(true), /Add stock/);

  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const originalFetch = globalThis.fetch;
  setApiClientToken("test-token");

  try {
    await act(async () =>
      root.render(
        <PaceInventoryWorkspace
          stock={{ ...emptyPage, items: [stock] }}
          stockView="attention"
          onStockViewChange={() => undefined}
          orders={emptyPage}
          stockEntry={{ onCreated: () => undefined }}
        />,
      ),
    );
    await act(async () =>
      [...container.querySelectorAll("button")]
        .find((button) => button.textContent === "Add stock")
        ?.click(),
    );
    assert.equal(document.activeElement?.tagName, "FIELDSET");
    await act(async () =>
      [...container.querySelectorAll("button")]
        .find((button) => button.textContent === "Cancel")
        ?.click(),
    );
    assert.equal(document.activeElement?.textContent, "Add stock");

    const response = deferred<Response>();
    const requests: Array<{ url: string; init: RequestInit }> = [];
    globalThis.fetch = (input, init) => {
      requests.push({ url: String(input), init: init ?? {} });
      return response.promise;
    };
    let added = 0;
    await act(async () =>
      root.render(
        <PaceInventoryBulkForm
          action="stock"
          item={stock}
          onCancel={() => undefined}
          onCreated={(count) => {
            added = count;
          }}
        />,
      ),
    );
    const choices = container.querySelectorAll<HTMLInputElement>(
      "input[type=checkbox]",
    );
    assert.equal(choices.length, 12);
    assert.equal(choices[0].disabled, true);
    await act(async () => choices[1].click());
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>("button[type=submit]")
        ?.click(),
    );
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "http://api.test/ace/pace/inventory/stock");
    assert.equal(requests[0].init.method, "POST");
    assert.equal(
      new Headers(requests[0].init.headers).get("Authorization"),
      "Bearer test-token",
    );
    assert.deepEqual(JSON.parse(String(requests[0].init.body)), {
      childId: "child-1",
      subjectId: "subject-1",
      paceNumbers: [1006],
    });
    assert.match(container.textContent ?? "", /Adding stock…/);
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
            supplyIds: ["supply-1"],
            created: 1,
          }),
          { status: 201 },
        ),
      ),
    );
    assert.equal(added, 1);

    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({ message: "A requested PACE is already supplied" }),
        { status: 409 },
      );
    let conflictAdded = false;
    await act(async () =>
      root.render(
        <PaceInventoryBulkForm
          action="stock"
          key="conflict"
          item={stock}
          onCancel={() => undefined}
          onCreated={() => {
            conflictAdded = true;
          }}
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
      /already supplied/,
    );
    assert.equal(conflictAdded, false);

    const staleResponse = deferred<Response>();
    globalThis.fetch = () => staleResponse.promise;
    let staleAdded = false;
    await act(async () =>
      root.render(
        <PaceInventoryBulkForm
          action="stock"
          key="site-switch"
          item={stock}
          onCancel={() => undefined}
          onCreated={() => {
            staleAdded = true;
          }}
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
    await act(async () => notifyActiveSiteChanged());
    await act(async () =>
      staleResponse.resolve(
        new Response(
          JSON.stringify({
            batchId: "batch-2",
            supplyIds: ["supply-2"],
            created: 1,
          }),
          { status: 201 },
        ),
      ),
    );
    assert.equal(staleAdded, false);

    await act(async () =>
      root.render(
        <PaceInventoryBulkForm
          action="stock"
          key="selection-limit"
          item={{ ...stock, currentPace: 1119, futurePaceNumbers: [] }}
          onCancel={() => undefined}
          onCreated={() => undefined}
        />,
      ),
    );
    for (let page = 0; page < 2; page += 1) {
      await act(async () =>
        [...container.querySelectorAll("button")]
          .find((button) => button.textContent === "Show next PACEs")
          ?.click(),
      );
    }
    const limitChoices = container.querySelectorAll<HTMLInputElement>(
      "input[type=checkbox]",
    );
    assert.equal(limitChoices.length, 25);
    for (let index = 0; index < 24; index += 1) {
      await act(async () => limitChoices[index].click());
    }
    assert.equal(limitChoices[24].disabled, true);
    assert.match(container.textContent ?? "", /24 selected/);
    await act(async () => limitChoices[0].click());
    assert.equal(limitChoices[24].disabled, false);
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
