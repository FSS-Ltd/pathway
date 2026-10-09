import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { setApiClientToken } from "@/lib/api-client";
import { FamilyTimetableView } from "./family-timetable-workspace";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/ace/family",
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
  const requested: string[] = [];
  let denied = false;
  const originalFetch = globalThis.fetch;
  setApiClientToken("family-token");
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    requested.push(url);
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      "Bearer family-token",
    );
    if (denied) return new Response("", { status: 404 });
    const params = new URL(url).searchParams;
    return new Response(
      JSON.stringify({
        siteId: "school-one",
        childId: "child-one",
        childName: "Ari",
        timezone: "Europe/London",
        from: params.get("from"),
        to: params.get("to"),
        items: [
          {
            id: "session-one",
            title: "Maths",
            startsAt: "2026-10-13T09:00:00.000Z",
            endsAt: "2026-10-13T10:00:00.000Z",
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  try {
    await act(async () => {
      root.render(
        <FamilyTimetableView
          scope={{ kind: "parent", siteId: "school-one", childId: "child-one" }}
          status="authenticated"
        />,
      );
    });
    assert.match(
      requested.at(-1) ?? "",
      /\/ace\/parent\/sites\/school-one\/children\/child-one\/timetable\?/,
    );
    assert.match(container.textContent ?? "", /Ari’s sessions/);
    assert.match(container.textContent ?? "", /Maths/);
    assert.doesNotMatch(container.textContent ?? "", /session-one/);

    denied = true;
    await act(async () => {
      root.render(
        <FamilyTimetableView
          scope={{ kind: "student", siteId: "school-one" }}
          status="authenticated"
        />,
      );
    });
    assert.match(
      requested.at(-1) ?? "",
      /\/ace\/student\/sites\/school-one\/timetable\?/,
    );
    assert.match(
      container.textContent ?? "",
      /Timetable is not available for this account/,
    );
    assert.doesNotMatch(container.textContent ?? "", /Maths/);

    denied = false;
    const retry = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Try again",
    );
    assert.ok(retry);
    await act(async () => retry.click());
    assert.match(container.textContent ?? "", /Maths/);

    const requestCount = requested.length;
    await act(async () => {
      root.render(
        <FamilyTimetableView
          scope={{ kind: "student", siteId: "school-one" }}
          status="unauthenticated"
        />,
      );
    });
    assert.equal(requested.length, requestCount);
    assert.match(container.textContent ?? "", /Sign in to view your timetable/);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = originalFetch;
    setApiClientToken(null);
    container.remove();
  }
}

void run();
