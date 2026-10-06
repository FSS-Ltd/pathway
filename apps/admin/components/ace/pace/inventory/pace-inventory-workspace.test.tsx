import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { resolveAdminNavItems } from "@/app/admin-navigation";
import { notifyActiveSiteChanged } from "@/lib/active-site-events";
import type {
  InventoryPage,
  PaceInventoryStockItem,
} from "@/lib/pace-inventory-api";
import { PaceInventoryWorkspace } from "./pace-inventory-workspace";
import {
  usePaceInventoryPage,
  type PagedInventory,
} from "./use-pace-inventory-page";

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

const stock: PaceInventoryStockItem = {
  child: { id: "child-1", displayName: "Amina Yusuf" },
  subject: { id: "subject-1", name: "Maths" },
  currentPace: 1004,
  futurePaceNumbers: [],
  availableCount: 0,
  hasPendingOrder: true,
  stockState: "NO_STOCK",
  needsAttention: true,
};
const noAction = () => undefined;
const emptyPage = <T,>(): PagedInventory<T> => ({
  items: [],
  nextCursor: null,
  isLoading: false,
  isLoadingMore: false,
  error: null,
  loadMoreError: null,
  retry: noAction,
  loadMore: noAction,
});

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
  const role = {
    isOrgAdmin: false,
    isOrgOwner: false,
    isSiteAdmin: false,
    isStaff: true,
    isSafeguardingStaff: false,
    isSuperUser: false,
  };
  const nav = (permissions: string[]) =>
    resolveAdminNavItems({
      role,
      currentOrgIsMasterOrg: false,
      capabilities: [],
      permissions,
      ui: { labels: {} },
    });
  assert.equal(
    nav([]).some((item) => item.href === "/ace/pace/inventory"),
    false,
  );
  assert.equal(
    nav(["ace.pace.inventory.read"]).some(
      (item) => item.href === "/ace/pace/inventory",
    ),
    true,
  );

  const emptyMarkup = renderToStaticMarkup(
    <PaceInventoryWorkspace
      stock={emptyPage()}
      stockView="attention"
      onStockViewChange={noAction}
      orders={emptyPage()}
    />,
  );
  assert.match(emptyMarkup, /No placements need stock attention/);
  assert.match(emptyMarkup, /No physical PACE orders have been recorded/);
  assert.match(emptyMarkup, /Show all placements/);

  const attention: PagedInventory<PaceInventoryStockItem> = {
    ...emptyPage<PaceInventoryStockItem>(),
    items: [stock],
    nextCursor: "next-page",
  };
  const populatedMarkup = renderToStaticMarkup(
    <PaceInventoryWorkspace
      stock={attention}
      stockView="attention"
      onStockViewChange={noAction}
      orders={{
        ...emptyPage(),
        items: [
          {
            id: "order-1",
            child: stock.child,
            subject: stock.subject,
            paceNumber: 1005,
            status: "IN_TRANSIT",
            orderedAt: "2026-10-06T10:00:00.000Z",
            inTransitAt: "2026-10-06T11:00:00.000Z",
            deliveredAt: null,
          },
        ],
        loadMoreError: "More orders unavailable.",
      }}
    />,
  );
  assert.match(populatedMarkup, /Amina Yusuf · Maths/);
  assert.match(populatedMarkup, /No stock/);
  assert.match(populatedMarkup, /A future PACE is on order/);
  assert.match(populatedMarkup, /Load more stock attention/);
  assert.match(populatedMarkup, /In transit/);
  assert.match(
    populatedMarkup,
    /More orders unavailable. Your earlier results are still shown./,
  );

  const allStockMarkup = renderToStaticMarkup(
    <PaceInventoryWorkspace
      stock={{
        ...emptyPage<PaceInventoryStockItem>(),
        items: [
          {
            ...stock,
            futurePaceNumbers: [1005, 1006, 1007],
            availableCount: 3,
            hasPendingOrder: false,
            stockState: "SUFFICIENT",
            needsAttention: false,
          },
        ],
      }}
      stockView="all"
      onStockViewChange={noAction}
      orders={emptyPage()}
    />,
  );
  assert.match(allStockMarkup, /Show attention only/);
  assert.match(allStockMarkup, /3 available/);
  assert.match(allStockMarkup, /1005, 1006, 1007/);

  const errorMarkup = renderToStaticMarkup(
    <PaceInventoryWorkspace
      stock={{ ...emptyPage(), error: "Stock unavailable" }}
      stockView="attention"
      onStockViewChange={noAction}
      orders={{ ...emptyPage(), isLoading: true }}
    />,
  );
  assert.match(errorMarkup, /role="alert"[^>]*>Stock unavailable/);
  assert.match(errorMarkup, /Loading pace orders/);
  assert.match(errorMarkup, />Retry</);

  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const first = deferred<InventoryPage<PaceInventoryStockItem>>();
  const second = deferred<InventoryPage<PaceInventoryStockItem>>();
  const third = deferred<InventoryPage<PaceInventoryStockItem>>();
  let calls = 0;
  const fetchPage = ({ cursor }: { cursor?: string }) => {
    calls += 1;
    if (calls === 3) assert.equal(cursor, "next-page");
    return calls === 1
      ? first.promise
      : calls === 2
        ? second.promise
        : third.promise;
  };
  function HookHarness() {
    const page = usePaceInventoryPage(fetchPage, true, "Stock unavailable");
    return (
      <div>
        <p>{page.items.map((item) => item.child.displayName).join(", ")}</p>
        {page.nextCursor ? (
          <button onClick={page.loadMore}>Load more</button>
        ) : null}
      </div>
    );
  }

  try {
    await act(async () => root.render(<HookHarness />));
    assert.equal(calls, 1);
    await act(async () => notifyActiveSiteChanged());
    assert.equal(calls, 2);
    await act(async () =>
      second.resolve({
        items: [
          { ...stock, child: { id: "child-2", displayName: "Samira Ali" } },
        ],
        nextCursor: "next-page",
      }),
    );
    assert.match(container.textContent ?? "", /Samira Ali/);
    await act(async () => {
      container.querySelector("button")?.click();
    });
    await act(async () =>
      third.resolve({
        items: [
          { ...stock, child: { id: "child-3", displayName: "Yusuf Khan" } },
        ],
        nextCursor: null,
      }),
    );
    assert.match(container.textContent ?? "", /Samira Ali, Yusuf Khan/);
    await act(async () => first.resolve({ items: [stock], nextCursor: null }));
    assert.doesNotMatch(container.textContent ?? "", /Amina Yusuf/);
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }

  process.env.NEXT_PUBLIC_USE_MOCK_API = "false";
  process.env.NEXT_PUBLIC_API_URL = "http://api.test";
  const { setApiClientToken } = await import("@/lib/api-client");
  const { fetchPaceInventoryAttention, fetchPaceInventoryStock } =
    await import("@/lib/pace-inventory-api");
  const originalFetch = globalThis.fetch;
  setApiClientToken("test-token");
  const requests: string[] = [];
  globalThis.fetch = async (input, init) => {
    requests.push(String(input));
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      "Bearer test-token",
    );
    return requests.length === 1
      ? new Response(JSON.stringify({ message: "Forbidden" }), { status: 403 })
      : new Response(JSON.stringify({ items: [stock], nextCursor: null }), {
          status: 200,
        });
  };
  try {
    await assert.rejects(fetchPaceInventoryAttention(), /Forbidden/);
    assert.equal((await fetchPaceInventoryStock()).items.length, 1);
    assert.deepEqual(requests, [
      "http://api.test/ace/pace/inventory/stock?limit=50&attentionOnly=true",
      "http://api.test/ace/pace/inventory/stock?limit=50",
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    setApiClientToken(null);
  }
}

run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
