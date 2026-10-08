import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { notifyActiveSiteChanged } from "@/lib/active-site-events";
import { setApiClientToken } from "@/lib/api-client";
import { searchStaffRecipients } from "@/lib/ace-messaging-api";
import { searchParentResponders } from "@/lib/ace-parent-messaging-api";
import { setApiTokenGetter } from "@/lib/api-transport";
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
const newConversationId = "19fce9a7-7cd2-4d3c-99cd-a7ffcedf43e8";
const roomConversationId = "edb94bc2-5c1a-4860-b54d-ab7d7429bead";
const pendingConversationId = "aa7fb6d8-2bbc-4401-8d64-680f9876ff10";
const staffId = "d2136e0b-76fa-4ad0-b605-819c4d80a322";
const peerId = "e71be020-929e-4799-bc15-a8062437832a";
const alexId = "c4a1e236-a2a9-4a44-8af7-7069c5859ddc";
const bobId = "f9775dd1-5a4d-4e5c-90b9-384b92de0d40";
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

async function changeSearch(element: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(element),
    "value",
  )?.set;
  assert.ok(setter);
  await act(async () => {
    setter.call(element, value);
    element.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 300));
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
  let roomOpenCount = 0;
  let readCursorSaved = false;
  const sentRequestIds: string[] = [];
  const recipientSearches: string[] = [];
  let alexSearchFailed = false;
  let resolvePendingCreate: ((response: Response) => void) | null = null;
  let resolvePendingRoom: ((response: Response) => void) | null = null;

  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      "Bearer test-token",
    );
    if (url.pathname.endsWith("/read-cursor")) {
      readCursorSaved = true;
      return jsonResponse({ lastReadSequence: 3 });
    }
    if (url.pathname.endsWith("/recipients")) {
      const search = url.searchParams.get("search") ?? "";
      recipientSearches.push(search);
      assert.equal(url.searchParams.get("limit"), "20");
      if (search === "Al" && !alexSearchFailed) {
        alexSearchFailed = true;
        return jsonResponse({ message: "temporary error" }, 500);
      }
      return jsonResponse({
        items:
          search === "Al"
            ? [{ id: alexId, displayName: "Alex Morgan" }]
            : [{ id: bobId, displayName: "Bob Lee" }],
        hasMore: false,
      });
    }
    if (method === "POST" && url.pathname.endsWith("/conversations")) {
      const body = JSON.parse(String(init?.body)) as {
        kind: string;
        recipientUserId?: string;
      };
      if (body.kind === "STAFF_ROOM") {
        assert.equal(body.recipientUserId, undefined);
        roomOpenCount += 1;
        if (roomOpenCount === 1) {
          return jsonResponse({ message: "temporary error" }, 500);
        }
        if (roomOpenCount === 3) {
          return new Promise<Response>((resolve) => {
            resolvePendingRoom = resolve;
          });
        }
        return jsonResponse({
          id: roomConversationId,
          kind: "STAFF_ROOM",
          created: true,
        });
      }
      assert.equal(body.kind, "STAFF_DIRECT");
      if (body.recipientUserId === bobId) {
        return new Promise<Response>((resolve) => {
          resolvePendingCreate = resolve;
        });
      }
      assert.equal(body.recipientUserId, alexId);
      return jsonResponse({
        id: newConversationId,
        kind: "STAFF_DIRECT",
        created: true,
      });
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
            sequence: 4,
            body: body.body,
            createdAt: "2026-10-07T10:02:00.000Z",
            reused: true,
          });
    }
    if (url.pathname.endsWith("/messages")) {
      if (
        url.pathname.includes(newConversationId) ||
        url.pathname.includes(roomConversationId)
      ) {
        return jsonResponse({ items: [], nextBefore: null });
      }
      return jsonResponse({
        items: [
          {
            id: "message-2",
            sequence: 3,
            body: "Good morning",
            createdAt: date,
            sender: { id: staffId, displayName: "You" },
            recipientRead: true,
          },
          {
            id: "message-1b",
            sequence: 2,
            body: "How are you?",
            createdAt: date,
            sender: { id: peerId, displayName: "Sam" },
            recipientRead: null,
          },
          {
            id: "message-1",
            sequence: 1,
            body: "Welcome",
            createdAt: date,
            sender: { id: peerId, displayName: "Sam" },
            recipientRead: null,
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
                unreadCount: readCursorSaved ? 0 : 1,
              },
            ]
          : [],
      nextCursor: null,
    });
  };
  setApiClientToken("test-token");

  try {
    await act(async () =>
      root.render(
        <StaffMessagingWorkspace currentUserId={staffId} canSend canCreate />,
      ),
    );
    assert.match(container.textContent ?? "", /Sam Adeyemi/);
    const conversationButton = Array.from(
      container.querySelectorAll("button"),
    ).find((button) => button.textContent?.includes("Sam Adeyemi"));
    assert.ok(conversationButton);
    assert.match(conversationButton.textContent ?? "", /1 unread message/);
    await act(async () => conversationButton.click());
    assert.doesNotMatch(container.textContent ?? "", /unread message/);
    assert.match(container.textContent ?? "", /Welcome/);
    assert.match(container.textContent ?? "", /How are you\?/);
    assert.match(container.textContent ?? "", /Good morning/);
    assert.match(container.querySelector("ol")?.textContent ?? "", /Read/);
    assert.equal(
      container.querySelectorAll('ol[aria-live="polite"] li').length,
      3,
    );
    assert.equal(
      container.querySelectorAll('ol p[aria-hidden="true"]').length,
      1,
      "consecutive incoming messages show the sender once",
    );
    assert.equal(
      container.querySelectorAll("ol time.sr-only").length,
      1,
      "the grouped message time remains available to assistive technology",
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
    assert.match(container.querySelector("ol")?.textContent ?? "", /Sent/);
    assert.doesNotMatch(
      container.querySelector("ol")?.textContent ?? "",
      /Read/,
    );
    assert.equal(
      textarea.value,
      "",
      "clears the draft only after server confirmation",
    );

    const staffRoom = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Staff room",
    );
    assert.ok(staffRoom);
    await act(async () => staffRoom.click());
    assert.match(
      container.querySelector('[role="alert"]')?.textContent ?? "",
      /Unable to open the staff room/,
    );
    await act(async () => staffRoom.click());
    assert.equal(roomOpenCount, 2);
    assert.match(container.textContent ?? "", /Start the conversation below/);
    assert.ok(
      Array.from(
        container.querySelectorAll(
          'ul[aria-label="Staff conversations"] button',
        ),
      ).some((button) => button.textContent?.includes("Staff room")),
    );

    const newMessage = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("New message"),
    );
    assert.ok(newMessage);
    await act(async () => newMessage.click());
    const search = container.querySelector<HTMLInputElement>(
      "#staff-recipient-search",
    );
    assert.ok(search);
    await changeSearch(search, "A");
    assert.deepEqual(recipientSearches, [], "one character does not search");
    await changeSearch(search, "Al");
    assert.deepEqual(recipientSearches, ["Al"]);
    const retrySearch = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Retry search"),
    );
    assert.ok(retrySearch);
    await act(async () => retrySearch.click());
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    assert.deepEqual(recipientSearches, ["Al", "Al"]);
    const alex = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Alex Morgan"),
    );
    assert.ok(alex);
    await act(async () => alex.click());
    assert.match(container.textContent ?? "", /Alex Morgan/);
    assert.match(container.textContent ?? "", /Start the conversation below/);

    const anotherMessage = Array.from(
      container.querySelectorAll("button"),
    ).find((button) => button.textContent?.includes("New message"));
    assert.ok(anotherMessage);
    await act(async () => anotherMessage.click());
    const secondSearch = container.querySelector<HTMLInputElement>(
      "#staff-recipient-search",
    );
    assert.ok(secondSearch);
    await changeSearch(secondSearch, "Bo");
    const bob = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Bob Lee"),
    );
    assert.ok(bob);
    await act(async () => bob.click());
    assert.ok(resolvePendingCreate);

    site = 2;
    await act(async () => notifyActiveSiteChanged(dom.window));
    await act(async () =>
      resolvePendingCreate?.(
        jsonResponse({
          id: pendingConversationId,
          kind: "STAFF_DIRECT",
          created: true,
        }),
      ),
    );
    assert.doesNotMatch(
      container.textContent ?? "",
      /Welcome|Good morning|Hello team|Alex Morgan|Bob Lee/,
    );
    assert.doesNotMatch(
      container.querySelector('ul[aria-label="Staff conversations"]')
        ?.textContent ?? "",
      /Staff room/,
    );
    assert.match(
      container.textContent ?? "",
      /No staff conversations are available/,
    );

    const pendingRoomButton = Array.from(
      container.querySelectorAll("button"),
    ).find((button) => button.textContent?.trim() === "Staff room");
    assert.ok(pendingRoomButton);
    await act(async () => pendingRoomButton.click());
    assert.ok(resolvePendingRoom);
    assert.equal(pendingRoomButton.disabled, true);
    const pendingNewMessage = Array.from(
      container.querySelectorAll("button"),
    ).find((button) => button.textContent?.trim() === "New message");
    assert.ok(pendingNewMessage?.disabled);

    site = 1;
    await act(async () => notifyActiveSiteChanged(dom.window));
    await act(async () =>
      resolvePendingRoom?.(
        jsonResponse({
          id: roomConversationId,
          kind: "STAFF_ROOM",
          created: true,
        }),
      ),
    );
    assert.doesNotMatch(
      container.querySelector('ul[aria-label="Staff conversations"]')
        ?.textContent ?? "",
      /Staff room/,
    );

    await act(async () =>
      root.render(
        <StaffMessagingWorkspace
          currentUserId={staffId}
          canSend={false}
          canCreate={false}
        />,
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
    assert.doesNotMatch(container.textContent ?? "", /New message/);
    assert.doesNotMatch(container.textContent ?? "", /Staff room/);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = originalFetch;
    setApiClientToken(null);
    container.remove();
  }

  const requestedPaths: string[] = [];
  setApiClientToken("expired-token");
  setApiTokenGetter(async () => "fresh-token");
  globalThis.fetch = async (input, init) => {
    requestedPaths.push(new URL(String(input)).pathname);
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      "Bearer fresh-token",
    );
    return jsonResponse({ items: [], hasMore: false });
  };
  try {
    await searchStaffRecipients("Sam");
    await searchParentResponders("site-one", "");
    assert.deepEqual(requestedPaths, [
      "/ace/messages/conversations/recipients",
      "/ace/parent/sites/site-one/messages/conversations/recipients",
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    setApiTokenGetter(null);
    setApiClientToken(null);
  }
}

void run();
