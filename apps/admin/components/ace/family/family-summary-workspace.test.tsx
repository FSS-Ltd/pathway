import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { setApiClientToken } from "@/lib/api-client";
import { FamilySummaryView } from "./family-summary-workspace";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/ace/parent/sites/site-one/children/child-one/summary",
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
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const originalFetch = globalThis.fetch;
  const requested: string[] = [];
  let denied = false;
  setApiClientToken("family-token");
  globalThis.fetch = async (input, init) => {
    requested.push(String(input));
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      "Bearer family-token",
    );
    if (denied) return new Response("", { status: 404 });
    return new Response(
      JSON.stringify({
        siteId: "site-one",
        childId: "child-one",
        childName: "Ari Alpha",
        asOf: "2026-10-11T12:00:00.000Z",
        sections: {
          attendance: {
            status: "ready",
            data: {
              counts: { present: 1, absent: 0, late: 0 },
              items: [{ date: "2026-10-10", status: "PRESENT" }],
            },
          },
          notices: {
            status: "error",
            message: "This section could not be loaded.",
          },
          messages: { status: "ready", data: { unreadCount: 2 } },
          homework: { status: "unavailable" },
          reports: { status: "unavailable" },
          slips: { status: "unavailable" },
          faith: { status: "unavailable" },
          finance: { status: "unavailable" },
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  try {
    await act(async () => {
      root.render(
        <FamilySummaryView
          siteId="site-one"
          childId="child-one"
          status="authenticated"
        />,
      );
    });
    assert.deepEqual(requested, [
      "http://api.test/ace/family/sites/site-one/children/child-one/summary",
    ]);
    assert.match(container.textContent ?? "", /Ari Alpha’s overview/);
    assert.match(container.textContent ?? "", /1 present/);
    assert.match(container.textContent ?? "", /2 unread messages/);
    assert.match(
      container.textContent ?? "",
      /This section could not be loaded/,
    );
    assert.equal(container.querySelectorAll('[role="alert"]').length, 1);
    assert.doesNotMatch(container.textContent ?? "", /Homework|Finance|Faith/);
    assert.equal(
      container.querySelector('a[href$="/attendance"]')?.getAttribute("href"),
      "/ace/parent/sites/site-one/children/child-one/attendance",
    );
    const sectionRetry = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Try again",
    );
    assert.ok(sectionRetry);
    await act(async () => sectionRetry.click());
    assert.equal(requested.length, 2);

    denied = true;
    await act(async () => {
      root.render(
        <FamilySummaryView
          key="denied"
          siteId="site-one"
          childId="child-one"
          status="authenticated"
        />,
      );
    });
    assert.match(container.textContent ?? "", /no longer available/);
    assert.doesNotMatch(container.textContent ?? "", /Ari Alpha/);
    const requestCount = requested.length;
    await act(async () => {
      root.render(
        <FamilySummaryView
          key="signed-out"
          siteId="site-one"
          childId="child-one"
          status="unauthenticated"
        />,
      );
    });
    assert.equal(requested.length, requestCount);
    assert.match(container.textContent ?? "", /Sign in to continue/);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = originalFetch;
    setApiClientToken(null);
    container.remove();
  }
}

void run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
