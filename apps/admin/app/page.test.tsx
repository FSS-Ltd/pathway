import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { SessionRuntime } from "@/lib/use-session-compat";
import DashboardPage from "./page";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/",
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

const nativeFetch = globalThis.fetch;
let announcementsAvailable = false;

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "x-request-id": "support-123",
    },
  });
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

async function run(): Promise<void> {
  globalThis.fetch = async (input) => {
    const path = new URL(String(input)).pathname;
    if (path === "/auth/me") return response({ userId: "user-1" });
    if (path === "/sessions" || path === "/concerns") {
      return response({ message: "private database trace" }, 503);
    }
    if (path === "/announcements") {
      return announcementsAvailable
        ? response([
            {
              id: "notice-1",
              title: "Visible notice",
              createdAt: new Date().toISOString(),
            },
          ])
        : response({ message: "private database trace" }, 500);
    }
    if (path === "/tenants/current/public-signup-link") {
      return response({ message: "private signup detail" }, 500);
    }
    throw new Error(`Unexpected request: ${path}`);
  };

  const { createRoot } = await import("react-dom/client");
  const container = document.body.appendChild(document.createElement("div"));
  const root = createRoot(container);
  try {
    await act(async () => {
      root.render(
        <SessionRuntime
          isLoaded
          isSignedIn
          getToken={async () => "token"}
          identity={{ id: "clerk-1", name: "Admin", email: null }}
        >
          <DashboardPage />
        </SessionRuntime>,
      );
    });
    await settle();
    assert.match(container.textContent ?? "", /Unable to load announcements/);
    assert.match(container.textContent ?? "", /Reference: support-123/);
    assert.doesNotMatch(container.textContent ?? "", /private database trace/);
    assert.doesNotMatch(container.textContent ?? "", /Visible notice/);
    assert.match(
      container.textContent ?? "",
      /Open concerns count is currently unavailable/,
    );

    const generate = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Generate QR",
    );
    assert.ok(generate);
    await act(async () => generate.click());
    await settle();
    assert.doesNotMatch(container.textContent ?? "", /private signup detail/);

    announcementsAvailable = true;
    const retry = Array.from(container.querySelectorAll("button")).find(
      (button) =>
        button.parentElement?.textContent?.includes(
          "Unable to load announcements",
        ) && button.textContent?.trim() === "Retry",
    );
    assert.ok(retry);
    await act(async () => retry.click());
    await settle();
    assert.match(container.textContent ?? "", /Visible notice/);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = nativeFetch;
    dom.window.close();
  }
}

void run().then(
  () => process.stdout.write("dashboard failure states: passed\n"),
  (error: unknown) => {
    process.stderr.write(String(error));
    process.exitCode = 1;
  },
);
