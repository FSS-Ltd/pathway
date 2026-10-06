import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { notifyActiveSiteChanged } from "@/lib/active-site-events";
import { setApiClientToken } from "@/lib/api-client";
import type { PaceInventoryOrderItem } from "@/lib/pace-inventory-api";

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

const ordered: PaceInventoryOrderItem = {
  id: "059b4e49-c225-4670-aed4-c992d09e82e0",
  child: { id: "child-1", displayName: "Amina Yusuf" },
  subject: { id: "subject-1", name: "Maths" },
  paceNumber: 1005,
  status: "ORDERED",
  orderedAt: "2026-10-06T10:00:00.000Z",
  inTransitAt: null,
  deliveredAt: null,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function run(): Promise<void> {
  const { PaceInventoryWorkspace } = await import("./pace-inventory-workspace");
  const { PaceInventoryOrderTransition } =
    await import("./pace-inventory-order-transition");
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
        stock={emptyPage}
        stockView="attention"
        onStockViewChange={() => undefined}
        orders={{ ...emptyPage, items: [ordered] }}
        orderTransition={
          canManage ? { onAdvanced: () => undefined } : undefined
        }
      />,
    );
  assert.doesNotMatch(workspace(false), /Mark in transit/);
  assert.match(workspace(true), /Mark in transit/);
  assert.equal(
    renderToStaticMarkup(
      <PaceInventoryOrderTransition
        order={{ ...ordered, status: "DELIVERED" }}
        onAdvanced={() => undefined}
      />,
    ),
    "",
  );

  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const originalFetch = globalThis.fetch;
  const first = deferred<Response>();
  const requests: Array<{ url: string; init: RequestInit }> = [];
  globalThis.fetch = (input, init) => {
    requests.push({ url: String(input), init: init ?? {} });
    return first.promise;
  };
  setApiClientToken("test-token");
  const advanced: string[] = [];
  const onAdvanced = (status: "IN_TRANSIT" | "DELIVERED") => {
    advanced.push(status);
  };
  const button = (label: string) =>
    [...container.querySelectorAll("button")].find(
      (element) => element.textContent === label,
    );

  try {
    await act(async () =>
      root.render(
        <PaceInventoryOrderTransition
          order={ordered}
          onAdvanced={onAdvanced}
        />,
      ),
    );
    await act(async () => button("Mark in transit")?.click());
    assert.match(
      container.textContent ?? "",
      /Confirm PACE 1005 is in transit/,
    );
    assert.equal(
      document.activeElement?.textContent,
      "Confirm mark in transit",
    );
    await act(async () => button("Cancel")?.click());
    assert.equal(document.activeElement?.textContent, "Mark in transit");
    await act(async () => button("Mark in transit")?.click());
    await act(async () => button("Confirm mark in transit")?.click());
    assert.equal(requests.length, 1);
    assert.equal(
      requests[0].url,
      `http://api.test/ace/pace/inventory/orders/${ordered.id}/status`,
    );
    assert.equal(requests[0].init.method, "PATCH");
    assert.equal(
      new Headers(requests[0].init.headers).get("Authorization"),
      "Bearer test-token",
    );
    assert.deepEqual(JSON.parse(String(requests[0].init.body)), {
      status: "IN_TRANSIT",
    });
    assert.equal(button("Updating…")?.disabled, true);
    await act(async () =>
      first.resolve(
        new Response(
          JSON.stringify({
            orderId: ordered.id,
            status: "IN_TRANSIT",
            reachedAt: "2026-10-06T11:00:00.000Z",
            supplyId: null,
          }),
          { status: 200 },
        ),
      ),
    );
    assert.deepEqual(advanced, ["IN_TRANSIT"]);
    assert.equal(container.textContent, "");

    const inTransit: PaceInventoryOrderItem = {
      ...ordered,
      status: "IN_TRANSIT",
      inTransitAt: "2026-10-06T11:00:00.000Z",
    };
    await act(async () =>
      root.render(
        <PaceInventoryOrderTransition
          order={inTransit}
          onAdvanced={onAdvanced}
        />,
      ),
    );
    await act(async () => button("Mark delivered")?.click());
    assert.match(container.textContent ?? "", /This adds it to physical stock/);
    globalThis.fetch = async (input, init) => {
      requests.push({ url: String(input), init: init ?? {} });
      return new Response(
        JSON.stringify({ message: "Order status has changed" }),
        {
          status: 409,
        },
      );
    };
    await act(async () => button("Confirm mark delivered")?.click());
    assert.match(
      container.querySelector('[role="alert"]')?.textContent ?? "",
      /Order status has changed/,
    );
    assert.deepEqual(JSON.parse(String(requests[1].init.body)), {
      status: "DELIVERED",
    });

    const stale = deferred<Response>();
    globalThis.fetch = () => stale.promise;
    await act(async () => button("Confirm mark delivered")?.click());
    await act(async () => notifyActiveSiteChanged());
    await act(async () =>
      stale.resolve(
        new Response(
          JSON.stringify({
            orderId: ordered.id,
            status: "DELIVERED",
            reachedAt: "2026-10-06T12:00:00.000Z",
            supplyId: "supply-1",
          }),
          { status: 200 },
        ),
      ),
    );
    assert.deepEqual(advanced, ["IN_TRANSIT"]);

    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          orderId: ordered.id,
          status: "DELIVERED",
          reachedAt: "2026-10-06T13:00:00.000Z",
          supplyId: "supply-1",
        }),
        { status: 200 },
      );
    await act(async () =>
      root.render(
        <PaceInventoryOrderTransition
          key="new-site"
          order={inTransit}
          onAdvanced={onAdvanced}
        />,
      ),
    );
    await act(async () => button("Mark delivered")?.click());
    await act(async () => button("Confirm mark delivered")?.click());
    assert.deepEqual(advanced, ["IN_TRANSIT", "DELIVERED"]);
    assert.equal(container.textContent, "");
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
