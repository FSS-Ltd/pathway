import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { setApiClientToken } from "@/lib/api-client";
import { MessageEmailSettings } from "./message-email-settings";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/ace/messages",
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

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

async function run(): Promise<void> {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const originalFetch = globalThis.fetch;
  const writes: Array<{ path: string; body: unknown }> = [];
  let reads = 0;
  globalThis.fetch = async (input, init) => {
    const path = new URL(String(input)).pathname;
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      "Bearer email-settings-test",
    );
    if (init?.method === "PUT") {
      const body: unknown = JSON.parse(String(init.body));
      writes.push({ path, body });
      return jsonResponse(
        path.endsWith("/mute")
          ? { muted: true }
          : {
              enabled: true,
              quietHoursStart: null,
              quietHoursEnd: null,
              timezone: "Europe/London",
            },
      );
    }
    reads += 1;
    return jsonResponse(
      path.endsWith("/mute")
        ? { muted: false }
        : {
            enabled: false,
            quietHoursStart: null,
            quietHoursEnd: null,
            timezone: "Europe/London",
          },
    );
  };
  setApiClientToken("email-settings-test");

  try {
    await act(async () =>
      root.render(
        <MessageEmailSettings
          path="/ace/messages/notifications"
          conversationId="conversation-one"
        />,
      ),
    );
    assert.equal(reads, 0, "closed settings do not fetch or disrupt the inbox");
    const details = container.querySelector("details");
    assert.ok(details);
    await act(async () => {
      details.open = true;
      details.dispatchEvent(new dom.window.Event("toggle", { bubbles: true }));
    });
    assert.equal(reads, 2);
    const checkbox = container.querySelector<HTMLInputElement>(
      'input[type="checkbox"]',
    );
    assert.ok(checkbox);
    await act(async () => checkbox.click());
    const form = container.querySelector("form");
    assert.ok(form);
    await act(async () => {
      form.dispatchEvent(
        new dom.window.Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    assert.deepEqual(writes[0], {
      path: "/ace/messages/notifications",
      body: { enabled: true, quietHoursStart: null, quietHoursEnd: null },
    });
    assert.match(container.textContent ?? "", /Saved/);
    const mute = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Mute",
    );
    assert.ok(mute);
    await act(async () => mute.click());
    assert.deepEqual(writes[1], {
      path: "/ace/messages/notifications/conversations/conversation-one/mute",
      body: { muted: true },
    });
    assert.match(container.textContent ?? "", /Unmute/);
  } finally {
    setApiClientToken(null);
    globalThis.fetch = originalFetch;
    await act(async () => root.unmount());
    container.remove();
  }
}

void run();
