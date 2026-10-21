import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { setApiClientToken } from "@/lib/api-client";
import { GuardianHomeworkView } from "./guardian-homework-workspace";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/ace/parent/sites/site-one/children/child-one/homework",
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
  const requests: string[] = [];
  let mode: "ready" | "empty" | "denied" = "ready";
  setApiClientToken("guardian-token");
  globalThis.fetch = async (input, init) => {
    requests.push(String(input));
    assert.equal(init?.method ?? "GET", "GET");
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      "Bearer guardian-token",
    );
    if (mode === "denied") return new Response("", { status: 404 });
    return Response.json(
      mode === "empty"
        ? []
        : [
            {
              id: "completed",
              title: "Fractions",
              dueAt: "2026-11-15T16:00:00.000Z",
              status: "COMPLETED",
              feedback: "Good use of examples.",
              feedbackReleasedAt: "2026-10-20T12:00:00.000Z",
              staffNote: "Private staff note",
            },
            {
              id: "pending",
              title: "Reading",
              dueAt: "2026-11-16T16:00:00.000Z",
              status: "SUBMITTED",
              feedback: "Unreleased feedback",
              feedbackReleasedAt: null,
            },
          ],
    );
  };

  try {
    await act(async () =>
      root.render(
        <GuardianHomeworkView
          siteId="site-one"
          childId="child-one"
          status="authenticated"
        />,
      ),
    );
    assert.deepEqual(requests, [
      "http://api.test/ace/family/sites/site-one/children/child-one/homework",
    ]);
    assert.match(container.textContent ?? "", /Good use of examples/);
    assert.doesNotMatch(container.textContent ?? "", /Unreleased feedback/);
    assert.doesNotMatch(container.textContent ?? "", /Private staff note/);
    assert.equal(container.querySelector("textarea"), null);
    assert.ok(
      container.querySelector(
        'a[href="/ace/parent/sites/site-one/children/child-one/summary"]',
      ),
    );

    mode = "denied";
    await act(async () =>
      root.render(
        <GuardianHomeworkView
          key="denied"
          siteId="site-one"
          childId="child-one"
          status="authenticated"
        />,
      ),
    );
    assert.match(container.textContent ?? "", /access could not be verified/);
    assert.doesNotMatch(container.textContent ?? "", /Good use of examples/);

    mode = "empty";
    const retry = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Try again",
    );
    assert.ok(retry);
    await act(async () => retry.click());
    assert.match(container.textContent ?? "", /No homework yet/);

    const requestCount = requests.length;
    await act(async () =>
      root.render(
        <GuardianHomeworkView
          key="signed-out"
          siteId="site-one"
          childId="child-one"
          status="unauthenticated"
        />,
      ),
    );
    assert.equal(requests.length, requestCount);
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
