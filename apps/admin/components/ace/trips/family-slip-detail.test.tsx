import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { setApiClientToken } from "@/lib/api-client";
import { FamilySlipDetailView } from "./family-slip-detail";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/ace/parent/sites/site-a/children/child-a/slips/slip-a",
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

const detail = {
  id: "slip-a",
  childId: "child-a",
  versionId: "version-a",
  version: 1,
  versionHash: "a".repeat(64),
  publishedAt: "2026-10-21T10:00:00.000Z",
  snapshot: {
    tripTitle: "Museum visit",
    title: "Museum consent",
    description: "Bring lunch",
    destination: "Science Museum",
    startsAt: "2026-11-20T09:00:00.000Z",
    endsAt: "2026-11-20T15:00:00.000Z",
    consentText: "I consent to this school visit.",
    deadlineAt: "2026-11-18T12:00:00.000Z",
    questions: [],
  },
  response: null,
  exception: null,
  needsReconsent: false,
  onlineResponsesEnabled: true,
  canRespond: true,
  closed: false,
};

function button(container: HTMLElement, label: string): HTMLButtonElement {
  const result = Array.from(container.querySelectorAll("button")).find(
    (candidate) => candidate.textContent?.includes(label),
  );
  assert.ok(result, `Missing ${label} button`);
  return result;
}

async function run() {
  const { createRoot } = await import("react-dom/client");
  const container = document.body.appendChild(document.createElement("div"));
  const root = createRoot(container);
  const oldFetch = globalThis.fetch;
  let writes = 0;
  setApiClientToken("guardian-token");
  globalThis.fetch = async (_input, init) => {
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      "Bearer guardian-token",
    );
    if (init?.method === "POST") {
      writes += 1;
      return Response.json({
        id: "response-a",
        decision: "DECLINED",
        respondedAt: new Date().toISOString(),
      });
    }
    return Response.json(detail);
  };
  try {
    await act(async () =>
      root.render(
        <FamilySlipDetailView
          siteId="site-a"
          childId="child-a"
          slipId="slip-a"
          status="authenticated"
        />,
      ),
    );
    assert.match(container.textContent ?? "", /I consent to this school visit/);
    assert.equal(writes, 0, "reading the slip must not submit a response");
    const checkbox = container.querySelector<HTMLInputElement>(
      'input[type="checkbox"]',
    );
    assert.ok(checkbox);
    assert.equal(
      checkbox.checked,
      false,
      "signature acknowledgment starts unchecked",
    );
    await act(async () => button(container, "Decline").click());
    assert.match(container.textContent ?? "", /Type your name and acknowledge/);
    assert.equal(writes, 0);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = oldFetch;
    setApiClientToken(null);
    container.remove();
  }
}

void run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
