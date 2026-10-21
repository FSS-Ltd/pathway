import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { setApiClientToken } from "@/lib/api-client";
import { TripSlipStaffDetail } from "./trip-slip-staff-detail";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/ace/trips",
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

function button(container: HTMLElement, label: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll("button")).find(
    (candidate) => candidate.textContent?.includes(label),
  );
  assert.ok(found, `Missing ${label} button`);
  return found;
}

async function run() {
  const { createRoot } = await import("react-dom/client");
  const container = document.body.appendChild(document.createElement("div"));
  const root = createRoot(container);
  const oldFetch = globalThis.fetch;
  let publishCalls = 0;
  const detail = {
    id: "slip-a",
    trip: {
      id: "trip-a",
      title: "Museum visit",
      destination: "Science Museum",
      startsAt: "2026-11-20T09:00:00.000Z",
      endsAt: "2026-11-20T15:00:00.000Z",
      cancelledAt: null,
    },
    versions: [
      {
        id: "version-a",
        version: 1,
        versionHash: null,
        contentSnapshot: {
          title: "Museum consent",
          tripTitle: "Museum visit",
          destination: "Science Museum",
          startsAt: "2026-11-20T09:00:00.000Z",
          endsAt: "2026-11-20T15:00:00.000Z",
          description: "Bring lunch",
          consentText: "I consent to the visit.",
          deadlineAt: "2026-11-18T12:00:00.000Z",
          questions: [],
          recipientChildIds: ["child-a"],
        },
        changeClassification: "INITIAL",
        requiresReconsent: true,
        publishedAt: null,
        scheduledAt: null,
        scheduleFailureReason: null,
        updatedAt: "2026-10-21T10:00:00.000Z",
        recipients: [{ childId: "child-a" }],
      },
    ],
    nextVersionCursor: null,
  };
  setApiClientToken("staff-token");
  globalThis.fetch = async (_input, init) => {
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      "Bearer staff-token",
    );
    if (init?.method === "POST") {
      publishCalls += 1;
      assert.deepEqual(JSON.parse(String(init.body)), {
        expectedVersionId: "version-a",
      });
    }
    return Response.json(detail);
  };
  try {
    await act(async () =>
      root.render(
        <TripSlipStaffDetail
          siteId="site-a"
          slipId="slip-a"
          canManage
          publicationEnabled
          witnesses={[]}
          onClose={() => {}}
        />,
      ),
    );
    assert.match(container.textContent ?? "", /I consent to the visit/);
    assert.equal(publishCalls, 0);
    await act(async () => button(container, "Review publication").click());
    assert.equal(publishCalls, 0, "review must not publish");
    assert.match(container.textContent ?? "", /Publish version 1 to 1 pupils/);
    await act(async () => button(container, "Confirm publication").click());
    assert.equal(publishCalls, 1);
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
