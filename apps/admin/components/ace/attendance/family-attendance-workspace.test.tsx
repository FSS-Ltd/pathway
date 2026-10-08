import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { setApiClientToken } from "@/lib/api-client";
import { FamilyAttendanceView } from "./family-attendance-workspace";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/ace/student/sites/site-one/attendance",
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  HTMLInputElement: dom.window.HTMLInputElement,
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
  const requested: string[] = [];
  let denied = false;
  const originalFetch = globalThis.fetch;
  setApiClientToken("test-token");
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    requested.push(url);
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      "Bearer test-token",
    );
    if (denied) return new Response("", { status: 404 });
    const params = new URL(url).searchParams;
    return new Response(
      JSON.stringify({
        siteId: "site-one",
        childId: "child-one",
        from: params.get("from"),
        to: params.get("to"),
        counts: { present: 1, absent: 0, late: 0 },
        items: [{ date: "2026-10-01", status: "PRESENT", absenceReason: null }],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  try {
    await act(async () => {
      root.render(
        <FamilyAttendanceView
          scope={{ kind: "student", siteId: "site-one" }}
          status="authenticated"
        />,
      );
    });
    assert.match(
      requested.at(-1) ?? "",
      /\/ace\/student\/sites\/site-one\/attendance\/daily\?/,
    );
    assert.doesNotMatch(requested.at(-1) ?? "", /children/);
    assert.match(container.textContent ?? "", /Your attendance/);
    assert.match(container.textContent ?? "", /Recorded days/);
    assert.match(container.textContent ?? "", /Present/);

    denied = true;
    await act(async () => {
      root.render(
        <FamilyAttendanceView
          scope={{ kind: "parent", siteId: "site-one", childId: "child-one" }}
          status="authenticated"
        />,
      );
    });
    assert.match(
      requested.at(-1) ?? "",
      /\/ace\/parent\/sites\/site-one\/children\/child-one\/attendance\/daily\?/,
    );
    assert.match(
      container.textContent ?? "",
      /Attendance is not available for this account/,
    );
    assert.doesNotMatch(container.textContent ?? "", /1 October 2026/);

    denied = false;
    const retry = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Try again",
    );
    assert.ok(retry);
    await act(async () => retry.click());
    assert.match(container.textContent ?? "", /Recorded days/);

    const requestCount = requested.length;
    await act(async () => {
      root.render(
        <FamilyAttendanceView
          scope={{ kind: "parent", siteId: "site-one", childId: "child-one" }}
          status="unauthenticated"
        />,
      );
    });
    assert.equal(requested.length, requestCount);
    assert.match(container.textContent ?? "", /Sign in to view attendance/);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = originalFetch;
    setApiClientToken(null);
    container.remove();
  }
}

void run();
