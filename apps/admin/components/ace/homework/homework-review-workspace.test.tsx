import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { setApiClientToken } from "@/lib/api-client";
import { ReviewCard } from "./homework-review-card";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/ace/homework/reviews",
});
Object.assign(globalThis, {
  window: dom.window,
  self: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  HTMLInputElement: dom.window.HTMLInputElement,
  HTMLTextAreaElement: dom.window.HTMLTextAreaElement,
  Event: dom.window.Event,
  MouseEvent: dom.window.MouseEvent,
  Node: dom.window.Node,
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  configurable: true,
});

const item = {
  assignmentId: "assignment",
  assignmentTitle: "Reading response",
  submissionId: "submission",
  versionId: "4dcf9ab3-501b-4b2f-958a-9df1507dd501",
  version: 1,
  studentName: "Review Pupil",
  text: "My response",
  submittedAt: "2026-10-20T12:00:00.000Z",
  late: false,
  evidence: null,
  review: null,
};

async function run() {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; body: unknown }> = [];
  let done = 0;
  setApiClientToken("reviewer-token");
  globalThis.fetch = async (input, init) => {
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      "Bearer reviewer-token",
    );
    requests.push({
      url: String(input),
      body: init?.body ? JSON.parse(String(init.body)) : null,
    });
    return Response.json({ id: "review", decision: "RETURNED" });
  };
  try {
    await act(async () =>
      root.render(
        <ReviewCard
          item={item}
          onDone={() => {
            done += 1;
          }}
        />,
      ),
    );
    assert.match(container.textContent ?? "", /Review Pupil/);
    assert.ok(
      container.querySelector(`label[for="feedback-${item.versionId}"]`),
    );
    assert.ok(
      container.querySelector(`label[for="staff-note-${item.versionId}"]`),
    );
    const buttons = Array.from(container.querySelectorAll("button"));
    const returned = buttons.find(
      (button) => button.textContent === "Return for changes",
    );
    assert.ok(returned?.disabled);
    await act(async () =>
      root.render(
        <ReviewCard
          item={{ ...item, review: { id: "review-id", releasedAt: null } }}
          onDone={() => {
            done += 1;
          }}
        />,
      ),
    );
    const release = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Release feedback to family",
    );
    assert.ok(release);
    await act(async () => release.click());
    assert.equal(requests.length, 0, "release requires confirmation");
    const confirm = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Confirm release",
    );
    assert.ok(confirm);
    await act(async () => confirm.click());
    assert.equal(done, 1);
    assert.match(
      requests[0].url,
      /\/ace\/homework\/reviews\/review-id\/release$/,
    );
    assert.equal(requests[0].body, null);
  } finally {
    globalThis.fetch = originalFetch;
    await act(async () => root.unmount());
    container.remove();
  }
}

void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
