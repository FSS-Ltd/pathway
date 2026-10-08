import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { setApiClientToken } from "@/lib/api-client";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/ace/parent/sites/site-one/messages",
});
Object.assign(globalThis, {
  window: dom.window,
  self: dom.window,
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

const parentId = "b8caabf1-99c6-4ec8-b705-bd5f0c2e3b44";
const responderId = "6a4f2c46-4b90-40bb-9ad9-a75b31ca7c51";
const conversationId = "cbb92675-2d6d-4f86-9399-28bf4e842723";
const date = "2026-10-08T10:00:00.000Z";

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function changeValue(
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string,
) {
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
  const { ParentMessagesView } = await import("./parent-messaging-workspace");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const originalFetch = globalThis.fetch;
  const sentRequestIds: string[] = [];
  let sendAttempts = 0;
  let cursorSaved = false;
  let openCount = 0;

  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      "Bearer parent-token",
    );
    if (url.pathname.includes("/site-denied/")) {
      return jsonResponse({ message: "not found" }, 404);
    }
    if (url.pathname.endsWith("/read-cursor")) {
      cursorSaved = true;
      return jsonResponse({ lastReadSequence: 1 });
    }
    if (url.pathname.endsWith("/recipients")) {
      assert.equal(url.searchParams.get("limit"), "20");
      return jsonResponse({
        items: [{ id: responderId, displayName: "Ms Taylor" }],
        hasMore: false,
      });
    }
    if (method === "POST" && url.pathname.endsWith("/conversations")) {
      openCount += 1;
      assert.deepEqual(JSON.parse(String(init?.body)), {
        recipientUserId: responderId,
      });
      return jsonResponse({
        id: conversationId,
        kind: "PARENT_STAFF",
        created: true,
      });
    }
    if (method === "POST" && url.pathname.endsWith("/messages")) {
      sendAttempts += 1;
      const body = JSON.parse(String(init?.body)) as {
        clientRequestId: string;
        body: string;
      };
      assert.equal(body.body, "Please call me");
      sentRequestIds.push(body.clientRequestId);
      return sendAttempts === 1
        ? jsonResponse({ message: "temporary error" }, 500)
        : jsonResponse({
            id: "message-sent",
            sequence: 2,
            body: body.body,
            createdAt: date,
            reused: true,
          });
    }
    if (url.pathname.endsWith("/messages")) {
      return jsonResponse({
        items: url.pathname.includes("/site-one/")
          ? [
              {
                id: "message-one",
                sequence: 1,
                body: "Hello from school",
                createdAt: date,
                sender: { id: responderId, displayName: "Ms Taylor" },
              },
            ]
          : [],
        nextBefore: null,
      });
    }
    return jsonResponse({
      items: url.pathname.includes("/site-one/")
        ? [
            {
              id: conversationId,
              kind: "PARENT_STAFF",
              title: "School team",
              latestMessage: { preview: "Hello from school", createdAt: date },
              updatedAt: date,
              unreadCount: cursorSaved ? 0 : 1,
            },
          ]
        : [],
      nextCursor: null,
    });
  };
  setApiClientToken("parent-token");

  try {
    await act(async () =>
      root.render(
        <ParentMessagesView
          key="site-one"
          siteId="site-one"
          currentUserId={parentId}
        />,
      ),
    );
    assert.match(container.textContent ?? "", /Hello from school/);
    assert.equal(cursorSaved, true);
    assert.ok(container.querySelector('label[for="parent-message-draft"]'));
    const textarea = container.querySelector("textarea");
    const form = container.querySelector("form");
    assert.ok(textarea && form);
    await changeValue(textarea, "Please call me");
    assert.equal(textarea.value, "Please call me");
    assert.equal(
      container
        .querySelector('button[type="submit"]')
        ?.hasAttribute("disabled"),
      false,
    );
    await act(async () =>
      form.dispatchEvent(
        new dom.window.Event("submit", { bubbles: true, cancelable: true }),
      ),
    );
    assert.equal(sendAttempts, 1);
    assert.match(
      container.querySelector('[role="alert"]')?.textContent ?? "",
      /still here/,
    );
    assert.equal(textarea.value, "Please call me");
    assert.doesNotMatch(
      container.querySelector("ol")?.textContent ?? "",
      /Please call me/,
    );
    await act(async () =>
      form.dispatchEvent(
        new dom.window.Event("submit", { bubbles: true, cancelable: true }),
      ),
    );
    assert.equal(sentRequestIds.length, 2);
    assert.equal(sentRequestIds[0], sentRequestIds[1]);
    assert.equal(textarea.value, "");
    assert.match(
      container.querySelector("ol")?.textContent ?? "",
      /Please call me/,
    );
    assert.match(container.querySelector("ol")?.textContent ?? "", /Sent/);

    await act(async () =>
      root.render(
        <ParentMessagesView
          key="site-new"
          siteId="site-new"
          currentUserId={parentId}
        />,
      ),
    );
    assert.doesNotMatch(container.textContent ?? "", /Hello from school/);
    await act(async () => new Promise((resolve) => setTimeout(resolve, 300)));
    assert.match(container.textContent ?? "", /Ms Taylor/);
    const responder = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Ms Taylor"),
    );
    assert.ok(responder);
    await act(async () => responder.click());
    assert.equal(openCount, 1);
    assert.match(container.textContent ?? "", /School team/);

    await act(async () =>
      root.render(
        <ParentMessagesView
          key="site-denied"
          siteId="site-denied"
          currentUserId={parentId}
        />,
      ),
    );
    assert.match(
      container.textContent ?? "",
      /school link or messaging access may have changed/i,
    );
    assert.doesNotMatch(
      container.textContent ?? "",
      /Ms Taylor|Hello from school/,
    );
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = originalFetch;
    setApiClientToken(null);
    container.remove();
  }
}

void run();
