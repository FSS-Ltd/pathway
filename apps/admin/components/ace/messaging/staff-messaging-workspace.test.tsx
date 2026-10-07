import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { notifyActiveSiteChanged } from "@/lib/active-site-events";
import { setApiClientToken } from "@/lib/api-client";
import { StaffMessagingWorkspace } from "./staff-messaging-workspace";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/ace/messages",
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  HTMLTextAreaElement: dom.window.HTMLTextAreaElement,
  MouseEvent: dom.window.MouseEvent,
  Event: dom.window.Event,
  Node: dom.window.Node,
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  configurable: true,
});

const conversationId = "a2f14e28-9fc3-477e-9ca2-83eef5ac1d09";
const staffId = "d2136e0b-76fa-4ad0-b605-819c4d80a322";
const peerId = "e71be020-929e-4799-bc15-a8062437832a";
const date = "2026-10-07T10:00:00.000Z";

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function changeDraft(element: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(element),
    "value",
  )?.set;
  assert.ok(setter);
  await act(async () => {
    setter.call(element, value);
    element.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
}

async function run(): Promise<void> {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const originalFetch = globalThis.fetch;
  let site = 1;
  let postCount = 0;
  const sentRequestIds: string[] = [];

  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      "Bearer test-token",
    );
    if (url.pathname.endsWith("/read-cursor")) {
      return jsonResponse({ lastReadSequence: 2 });
    }
    if (method === "POST") {
      postCount += 1;
      const body = JSON.parse(String(init?.body)) as {
        clientRequestId: string;
        body: string;
      };
      sentRequestIds.push(body.clientRequestId);
      assert.equal(body.body, "Hello team");
      return postCount === 1
        ? jsonResponse({ message: "temporary error" }, 500)
        : jsonResponse({
            id: "f5932f74-570c-4c22-a9bc-4d221883430e",
            conversationId,
            clientRequestId: body.clientRequestId,
            sequence: 3,
            body: body.body,
            createdAt: "2026-10-07T10:02:00.000Z",
            reused: true,
          });
    }
    if (url.pathname.endsWith("/messages")) {
      return jsonResponse({
        items: [
          {
            id: "message-2",
            sequence: 2,
            body: "Good morning",
            createdAt: date,
            sender: { id: staffId, displayName: "You" },
          },
          {
            id: "message-1",
            sequence: 1,
            body: "Welcome",
            createdAt: date,
            sender: { id: peerId, displayName: "Sam" },
          },
        ],
        nextBefore: null,
      });
    }
    return jsonResponse({
      items:
        site === 1
          ? [
              {
                id: conversationId,
                kind: "STAFF_DIRECT",
                title: "Sam Adeyemi",
                latestMessage: { preview: "Good morning", createdAt: date },
                updatedAt: date,
              },
            ]
          : [],
      nextCursor: null,
    });
  };
  setApiClientToken("test-token");

  try {
    await act(async () =>
      root.render(<StaffMessagingWorkspace currentUserId={staffId} canSend />),
    );
    assert.match(container.textContent ?? "", /Sam Adeyemi/);
    const conversationButton = Array.from(
      container.querySelectorAll("button"),
    ).find((button) => button.textContent?.includes("Sam Adeyemi"));
    assert.ok(conversationButton);
    await act(async () => conversationButton.click());
    assert.match(container.textContent ?? "", /Welcome/);
    assert.match(container.textContent ?? "", /Good morning/);
    assert.equal(
      container.querySelectorAll('ol[aria-live="polite"] li').length,
      2,
    );
    assert.equal(
      container.querySelector("textarea")?.getAttribute("aria-label"),
      null,
    );
    assert.ok(container.querySelector('label[for="staff-message-draft"]'));

    const textarea = container.querySelector("textarea");
    const form = container.querySelector("form");
    assert.ok(textarea && form);
    await changeDraft(textarea, "Hello team");
    await act(async () =>
      form.dispatchEvent(
        new dom.window.Event("submit", { bubbles: true, cancelable: true }),
      ),
    );
    assert.match(
      container.querySelector('[role="alert"]')?.textContent ?? "",
      /still here/,
    );
    assert.equal(
      textarea.value,
      "Hello team",
      "keeps a failed draft for retry",
    );
    await act(async () =>
      form.dispatchEvent(
        new dom.window.Event("submit", { bubbles: true, cancelable: true }),
      ),
    );
    assert.equal(sentRequestIds.length, 2);
    assert.equal(
      sentRequestIds[0],
      sentRequestIds[1],
      "retries use one client request ID",
    );
    assert.match(container.textContent ?? "", /Hello team/);
    assert.equal(
      textarea.value,
      "",
      "clears the draft only after server confirmation",
    );

    site = 2;
    await act(async () => notifyActiveSiteChanged(dom.window));
    assert.doesNotMatch(
      container.textContent ?? "",
      /Welcome|Good morning|Hello team/,
    );
    assert.match(
      container.textContent ?? "",
      /No staff conversations are available/,
    );

    site = 1;
    await act(async () =>
      root.render(
        <StaffMessagingWorkspace currentUserId={staffId} canSend={false} />,
      ),
    );
    await act(async () => notifyActiveSiteChanged(dom.window));
    const readOnlyConversation = Array.from(
      container.querySelectorAll("button"),
    ).find((button) => button.textContent?.includes("Sam Adeyemi"));
    assert.ok(readOnlyConversation);
    await act(async () => readOnlyConversation.click());
    assert.equal(container.querySelector("textarea"), null);
    assert.match(container.textContent ?? "", /do not have permission to send/);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = originalFetch;
    setApiClientToken(null);
    container.remove();
  }
}

void run();
