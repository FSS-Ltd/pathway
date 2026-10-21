import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { FaithReflectionReview } from "./faith-reflection-review";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/ace/faith",
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  Event: dom.window.Event,
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  configurable: true,
});

const response = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}

function button(container: HTMLElement, label: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll("button")).find(
    (element) => element.textContent?.trim() === label,
  );
  assert.ok(found, `Expected ${label} button`);
  return found;
}

async function run() {
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
  let moderationStatus: "PENDING" | "APPROVED" = "PENDING";
  let released = false;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    requests.push(`${init?.method ?? "GET"} ${url.pathname}`);
    if (url.pathname.endsWith("/moderate")) {
      moderationStatus = "APPROVED";
      return response({ id: "reflection-one" });
    }
    if (url.pathname.endsWith("/release")) {
      released = true;
      return response({ id: "reflection-one" });
    }
    if (url.pathname.endsWith("/reflections")) {
      return response({
        items: [
          {
            id: "reflection-one",
            studentName: "Test Pupil",
            text: "A private thought",
            submittedAt: "2026-10-21T10:00:00.000Z",
            moderationStatus,
            visibility: released ? "RELEASED_GUARDIANS" : "AUTHOR_AND_STAFF",
            guardianReleasedAt: released ? "2026-10-21T11:00:00.000Z" : null,
          },
        ],
        nextCursor: null,
      });
    }
    throw new Error(`Unexpected request ${url.pathname}`);
  };
  const container = document.body.appendChild(document.createElement("div"));
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(<FaithReflectionReview contentId="content-one" />),
    );
    await settle();
    assert.match(container.textContent ?? "", /A private thought/);
    await act(async () => button(container, "Approve").click());
    assert.equal(
      requests.filter((item) => item.endsWith("/moderate")).length,
      0,
    );
    await act(async () => button(container, "Confirm approve").click());
    await settle();
    assert.equal(
      requests.filter((item) => item.endsWith("/moderate")).length,
      1,
    );
    await act(async () => button(container, "Release to guardians").click());
    assert.equal(
      requests.filter((item) => item.endsWith("/release")).length,
      0,
    );
    await act(async () =>
      button(container, "Confirm release to guardians").click(),
    );
    await settle();
    assert.equal(
      requests.filter((item) => item.endsWith("/release")).length,
      1,
    );
    assert.match(container.textContent ?? "", /Released to guardians/);
    assert.equal(document.activeElement?.id, "faith-reflection-reflection-one");
  } finally {
    await act(async () => root.unmount());
    container.remove();
    globalThis.fetch = originalFetch;
    dom.window.close();
  }
}

void run();
