import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { setApiClientToken } from "@/lib/api-client";
import { SchoolVolunteeringView } from "./school-volunteering-workspace";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/ace/parent/sites/site-a/volunteering",
});
Object.assign(globalThis, {
  window: dom.window,
  self: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  Event: dom.window.Event,
  MouseEvent: dom.window.MouseEvent,
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
  const requests: Array<{ path: string; method: string; body: string | null }> =
    [];
  const originalFetch = globalThis.fetch;
  let selected = false;
  setApiClientToken("family-token");
  globalThis.fetch = async (input, init) => {
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      "Bearer family-token",
    );
    const path = String(input);
    const method = init?.method ?? "GET";
    requests.push({
      path,
      method,
      body: typeof init?.body === "string" ? init.body : null,
    });
    if (method === "PUT") {
      selected = true;
      return Response.json({ added: 1, removed: 0 });
    }
    return Response.json({
      siteId: "site-a",
      capacity: 2,
      periods: [
        {
          id: "period-a",
          name: "Autumn",
          startsOn: "2027-09-01",
          endsOn: "2027-12-20",
          days: [
            {
              date: "2027-10-12",
              status: selected ? "Selected" : "Available",
              spacesLeft: selected ? 0 : 1,
            },
            { date: "2027-10-13", status: "Full", spacesLeft: 0 },
          ],
        },
      ],
    });
  };

  try {
    await act(async () =>
      root.render(
        <SchoolVolunteeringView siteId="site-a" status="authenticated" />,
      ),
    );
    assert.match(container.textContent ?? "", /1 space left/);
    const checkboxes = container.querySelectorAll<HTMLInputElement>(
      'input[type="checkbox"]',
    );
    assert.equal(checkboxes.length, 2);
    assert.equal(checkboxes[1].disabled, true);
    const save = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Save days"),
    );
    assert.ok(save);
    assert.equal(save.disabled, true);
    await act(async () => checkboxes[0].click());
    assert.equal(save.disabled, false);
    await act(async () => save.click());
    assert.deepEqual(
      JSON.parse(
        requests.find((request) => request.method === "PUT")?.body ?? "null",
      ),
      { dates: ["2027-10-12"] },
    );
    assert.match(container.textContent ?? "", /1 day added, 0 removed/);
    assert.equal(save.disabled, true);

    await act(async () =>
      root.render(
        <SchoolVolunteeringView siteId="site-a" status="unauthenticated" />,
      ),
    );
    assert.match(container.textContent ?? "", /Sign in to continue/);
  } finally {
    await act(async () => root.unmount());
    setApiClientToken(null);
    globalThis.fetch = originalFetch;
    container.remove();
  }
}

void run();
