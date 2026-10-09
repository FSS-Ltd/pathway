import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { RecipientPicker, type Recipient } from "./recipient-picker";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/ace/messages",
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  IS_REACT_ACT_ENVIRONMENT: true,
});

const copy = {
  title: "New message",
  label: "To: Staff member at this site",
  placeholder: "Search staff",
  hint: "Choose a colleague.",
  intro: "No staff available.",
  noMatch: "No match.",
  searchError: "Unable to load staff. Try again.",
  openError: "Unable to start this conversation.",
};

async function run(): Promise<void> {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const originalTimeout = Object.getOwnPropertyDescriptor(
    AbortSignal,
    "timeout",
  );
  const nativeTimeout = AbortSignal.timeout;
  Object.defineProperty(AbortSignal, "timeout", {
    configurable: true,
    value: () => nativeTimeout(1),
  });
  let searches = 0;

  try {
    await act(async () => {
      root.render(
        <RecipientPicker
          onOpen={async (_recipient: Recipient) => true}
          searchRecipients={async (_search, signal) => {
            searches += 1;
            return new Promise<{ items: Recipient[]; hasMore: boolean }>(
              (_, reject) => {
                const fail = () => reject(new Error("Request timed out"));
                if (signal?.aborted) fail();
                else signal?.addEventListener("abort", fail, { once: true });
              },
            );
          }}
          searchId="recipient-search"
          minSearchLength={0}
          copy={copy}
        />,
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });

    assert.equal(searches, 1);
    assert.match(
      container.querySelector('[role="alert"]')?.textContent ?? "",
      /Unable to load staff. Try again./,
    );
    const retry = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Try again"),
    );
    assert.ok(retry);
    await act(async () => retry.click());
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    assert.equal(searches, 2);
  } finally {
    await act(async () => root.unmount());
    if (originalTimeout) {
      Object.defineProperty(AbortSignal, "timeout", originalTimeout);
    }
    container.remove();
    dom.window.close();
  }
}

void run();
