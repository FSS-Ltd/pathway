import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { setApiClientToken } from "@/lib/api-client";
import { FamilyPublicationCard } from "./family-publication-card";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/sessions/session-one",
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
  const methods: string[] = [];
  const changes: Array<string | null> = [];
  let denied = false;
  setApiClientToken("manager-token");
  globalThis.fetch = async (_input, init) => {
    methods.push(init?.method ?? "GET");
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      "Bearer manager-token",
    );
    if (denied) return new Response("", { status: 403 });
    return new Response(
      JSON.stringify({ familyPublishedAt: "2026-10-09T09:00:00.000Z" }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  try {
    await act(async () => {
      root.render(
        <FamilyPublicationCard
          sessionId="session-one"
          publishedAt={null}
          onChanged={(value) => changes.push(value)}
        />,
      );
    });
    assert.match(container.textContent ?? "", /Private/);
    await act(async () => {
      container.querySelector("button")?.click();
    });
    assert.deepEqual(methods, ["POST"]);
    assert.deepEqual(changes, ["2026-10-09T09:00:00.000Z"]);

    denied = true;
    await act(async () => {
      root.render(
        <FamilyPublicationCard
          sessionId="session-one"
          publishedAt={changes[0]}
          onChanged={(value) => changes.push(value)}
        />,
      );
    });
    await act(async () => {
      container.querySelector("button")?.click();
    });
    assert.deepEqual(methods, ["POST", "DELETE"]);
    assert.equal(changes.length, 1);
    assert.match(
      container.querySelector('[role="alert"]')?.textContent ?? "",
      /do not have access/,
    );
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = originalFetch;
    setApiClientToken(null);
    container.remove();
  }
}

void run();
