import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { AdminContextRuntime } from "@/lib/admin-context";
import type { SessionContextValue } from "@/lib/use-session-compat";
import MySchedulePage from "./page";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/my-schedule",
});
Object.assign(globalThis, {
  window: dom.window,
  self: dom.window,
  document: dom.window.document,
  Event: dom.window.Event,
  HTMLElement: dom.window.HTMLElement,
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  configurable: true,
});

const session = (
  status: "loading" | "unauthenticated",
): SessionContextValue => ({
  data: null,
  status,
  error: null,
  update: async () => undefined,
});

async function run(): Promise<void> {
  const { createRoot } = await import("react-dom/client");
  const container = document.body.appendChild(document.createElement("div"));
  const root = createRoot(container);
  try {
    await act(async () => {
      root.render(
        <AdminContextRuntime session={session("loading")}>
          <MySchedulePage />
        </AdminContextRuntime>,
      );
    });
    assert.match(container.textContent ?? "", /Loading your schedule/);
    assert.doesNotMatch(
      container.textContent ?? "",
      /Sign in to see your schedule/,
    );

    await act(async () => {
      root.render(
        <AdminContextRuntime session={session("unauthenticated")}>
          <MySchedulePage />
        </AdminContextRuntime>,
      );
    });
    assert.match(container.textContent ?? "", /Sign in to see your schedule/);
    assert.equal(
      container.querySelector('a[href="/login"]')?.textContent,
      "Sign in",
    );
  } finally {
    await act(async () => root.unmount());
  }
}

void run().then(
  () => process.stdout.write("schedule session states: passed\n"),
  (error: unknown) => {
    process.stderr.write(String(error));
    process.exitCode = 1;
  },
);
