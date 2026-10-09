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

const staffId = "d2136e0b-76fa-4ad0-b605-819c4d80a322";
const conversationId = "a2f14e28-9fc3-477e-9ca2-83eef5ac1d09";
const createdAt = "2026-10-07T10:00:00.000Z";

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function buttonByText(container: HTMLElement, text: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll("button")).find(
    (item) => item.textContent?.trim() === text,
  );
  assert.ok(button, `Expected button: ${text}`);
  return button;
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
  let schoolTeamRequests = 0;
  let sendCount = 0;
  const requestIds: string[] = [];
  const readSequences: number[] = [];

  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      "Bearer test-token",
    );
    if (url.pathname.includes("/school-team")) schoolTeamRequests += 1;
    if (url.pathname.endsWith("/read-cursor")) {
      assert.equal(method, "PUT");
      readSequences.push(
        (JSON.parse(String(init?.body)) as { sequence: number }).sequence,
      );
      return jsonResponse({ lastReadSequence: 2 });
    }
    if (method === "POST") {
      const body = JSON.parse(String(init?.body)) as {
        clientRequestId: string;
        body: string;
      };
      requestIds.push(body.clientRequestId);
      assert.equal(body.body, "Hello parent");
      sendCount += 1;
      return sendCount === 1
        ? jsonResponse({ message: "temporary error" }, 500)
        : jsonResponse({
            id: "sent-1",
            conversationId,
            clientRequestId: body.clientRequestId,
            sequence: 3,
            body: body.body,
            createdAt,
            reused: true,
          });
    }
    if (url.pathname.endsWith("/messages")) {
      return jsonResponse({
        items: [
          {
            id: "parent-1",
            sequence: 2,
            body: "Can we talk?",
            createdAt,
            sender: { id: "parent-id", displayName: "Amira" },
          },
        ],
        nextBefore: null,
      });
    }
    if (url.pathname.endsWith("/school-team")) {
      return site === 1
        ? jsonResponse({
            items: [
              {
                id: conversationId,
                kind: "PARENT_STAFF",
                title: "Amira",
                latestMessage: { preview: "Can we talk?", createdAt },
                updatedAt: createdAt,
                unreadCount: readSequences.length ? 0 : 1,
              },
            ],
            nextCursor: null,
          })
        : jsonResponse({ message: "Not found" }, 404);
    }
    return jsonResponse({ items: [], nextCursor: null });
  };
  setApiClientToken("test-token");

  try {
    await act(async () =>
      root.render(
        <StaffMessagingWorkspace
          currentUserId={staffId}
          canSend
          canCreate
          familyMessagingEnabled={false}
        />,
      ),
    );
    const unavailableChannel = buttonByText(container, "School Team");
    assert.equal(unavailableChannel.disabled, true);
    assert.match(container.textContent ?? "", /parent portal is enabled/);
    assert.equal(schoolTeamRequests, 0);

    await act(async () =>
      root.render(
        <StaffMessagingWorkspace
          currentUserId={staffId}
          canSend
          canCreate
          familyMessagingEnabled
        />,
      ),
    );
    assert.equal(
      schoolTeamRequests,
      0,
      "school inbox loads only when selected",
    );
    await act(async () => buttonByText(container, "School Team").click());
    assert.match(container.textContent ?? "", /Amira/);
    assert.equal(
      container.querySelector('button[aria-pressed="true"]')?.textContent,
      "School Team",
    );
    assert.doesNotMatch(container.textContent ?? "", /New message|Staff room/);
    const thread = container.querySelector<HTMLButtonElement>(
      'ul[aria-label="School team conversations"] button',
    );
    assert.ok(thread);
    await act(async () => thread.click());
    assert.match(container.textContent ?? "", /Can we talk\?/);
    assert.match(container.textContent ?? "", /Parent conversation/);
    assert.deepEqual(readSequences, [2]);
    assert.doesNotMatch(
      container.querySelector("ol")?.textContent ?? "",
      /Read|Sent/,
    );
    const textarea = container.querySelector("textarea");
    const form = container.querySelector("form");
    assert.ok(textarea && form);
    await changeDraft(textarea, "Hello parent");
    await act(async () => {
      form.dispatchEvent(
        new dom.window.Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    assert.match(container.textContent ?? "", /Your message is still here/);
    assert.equal(textarea.value, "Hello parent");
    await act(async () => {
      form.dispatchEvent(
        new dom.window.Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    assert.equal(requestIds.length, 2);
    assert.equal(requestIds[0], requestIds[1]);
    assert.match(
      container.querySelector("ol")?.textContent ?? "",
      /Hello parent/,
    );
    assert.doesNotMatch(
      container.querySelector("ol")?.textContent ?? "",
      /Read|Sent/,
    );

    site = 2;
    await act(async () => notifyActiveSiteChanged(dom.window));
    assert.doesNotMatch(
      container.textContent ?? "",
      /Amira|Can we talk\?|Hello parent/,
    );
    assert.match(
      container.textContent ?? "",
      /School team messages are unavailable/,
    );
    const requestsBeforePortalClosed = schoolTeamRequests;
    await act(async () =>
      root.render(
        <StaffMessagingWorkspace
          currentUserId={staffId}
          canSend
          canCreate
          familyMessagingEnabled={false}
        />,
      ),
    );
    assert.equal(buttonByText(container, "School Team").disabled, true);
    assert.equal(
      container.querySelector('button[aria-pressed="true"]')?.textContent,
      "Staff",
    );
    assert.equal(schoolTeamRequests, requestsBeforePortalClosed);
    assert.doesNotMatch(
      container.textContent ?? "",
      /School team messages are unavailable/,
    );
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = originalFetch;
    setApiClientToken(null);
    container.remove();
  }
}

void run();
