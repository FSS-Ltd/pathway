import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { setApiClientToken } from "@/lib/api-client";
import { StudentSelfSummaryView } from "./student-self-summary-workspace";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/ace/student/sites/site-one/summary",
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
  let mode: "ready" | "unavailable" | "error" | "denied" = "ready";
  setApiClientToken("student-token");
  globalThis.fetch = async (input, init) => {
    requested.push(String(input));
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      "Bearer student-token",
    );
    if (mode === "denied") return new Response("", { status: 404 });
    return new Response(
      JSON.stringify({
        siteId: "site-one",
        childName: "Sam Student",
        asOf: "2026-10-11T12:00:00.000Z",
        sections: {
          attendance:
            mode === "unavailable"
              ? { status: "unavailable" }
              : mode === "error"
                ? {
                    status: "error",
                    message: "Attendance could not be loaded.",
                  }
                : {
                    status: "ready",
                    data: {
                      counts: { present: 1, absent: 0, late: 0 },
                      items: [{ date: "2026-10-10", status: "PRESENT" }],
                    },
                  },
          homework: { status: "unavailable" },
          pace: { status: "unavailable" },
          faith: { status: "unavailable" },
          reports: { status: "unavailable" },
          slips: { status: "unavailable" },
          community: { status: "unavailable" },
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  try {
    await act(async () => {
      root.render(
        <StudentSelfSummaryView siteId="site-one" status="authenticated" />,
      );
    });
    assert.deepEqual(requested, [
      "http://api.test/ace/student/sites/site-one/summary",
    ]);
    assert.match(container.textContent ?? "", /Sam Student’s school overview/);
    assert.match(container.textContent ?? "", /1 present/);
    assert.doesNotMatch(container.textContent ?? "", /Homework|Messages|Faith/);
    assert.equal(
      container.querySelector('a[href$="/attendance"]')?.getAttribute("href"),
      "/ace/student/sites/site-one/attendance",
    );

    mode = "unavailable";
    await act(async () => {
      root.render(
        <StudentSelfSummaryView
          key="unavailable"
          siteId="site-one"
          status="authenticated"
        />,
      );
    });
    assert.match(container.textContent ?? "", /No updates yet/);

    mode = "error";
    await act(async () => {
      root.render(
        <StudentSelfSummaryView
          key="error"
          siteId="site-one"
          status="authenticated"
        />,
      );
    });
    assert.equal(container.querySelectorAll('[role="alert"]').length, 1);
    const retry = container.querySelector("button");
    assert.ok(retry);
    await act(async () => retry.click());
    assert.equal(requested.length, 4);

    mode = "denied";
    await act(async () => {
      root.render(
        <StudentSelfSummaryView
          key="denied"
          siteId="site-one"
          status="authenticated"
        />,
      );
    });
    assert.match(container.textContent ?? "", /no longer available/);
    assert.doesNotMatch(container.textContent ?? "", /Sam Student/);

    const requestCount = requested.length;
    await act(async () => {
      root.render(
        <StudentSelfSummaryView
          key="signed-out"
          siteId="site-one"
          status="unauthenticated"
        />,
      );
    });
    assert.equal(requested.length, requestCount);
    assert.match(container.textContent ?? "", /Sign in to continue/);
    assert.doesNotMatch(container.textContent ?? "", /Sam Student/);
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
