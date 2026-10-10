import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { setApiClientToken } from "@/lib/api-client";
import { StaffNoticeInbox } from "./staff-notice-inbox";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/notices",
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

const notice = {
  id: "e60bb733-1e40-4dc1-a5a7-7c3603bc4921",
  title: "Staff update",
  audience: "STAFF",
  historical: false,
  publishedAt: "2026-10-10T10:00:00.000Z",
  expiresAt: null,
  deliveredAt: "2026-10-10T10:00:00.000Z",
  readAt: null,
};

function click(container: Element, label: string): void {
  const button = Array.from(container.querySelectorAll("button")).find(
    (candidate) => candidate.textContent?.includes(label),
  );
  assert.ok(button, `missing button ${label}`);
  button.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
}

async function run() {
  const { createRoot } = await import("react-dom/client");
  const container = document.body.appendChild(document.createElement("div"));
  const root = createRoot(container);
  const originalFetch = globalThis.fetch;
  const requested: string[] = [];
  let listMode: "filled" | "historical" | "empty" | "denied" = "filled";
  setApiClientToken("notice-token");
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    requested.push(`${init?.method ?? "GET"} ${url}`);
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      "Bearer notice-token",
    );
    if (listMode === "denied") return new Response("", { status: 403 });
    if (url.endsWith("/read")) {
      return Response.json({ readAt: "2026-10-10T11:00:00.000Z" });
    }
    if (url.endsWith(`/${notice.id}`)) {
      return Response.json({
        ...notice,
        historical: listMode === "historical",
        body: "Please read this update.",
      });
    }
    return Response.json({
      items:
        listMode === "filled"
          ? [notice]
          : listMode === "historical"
            ? [{ ...notice, historical: true, deliveredAt: null }]
            : [],
      nextCursor: null,
    });
  };

  try {
    await act(async () => root.render(<StaffNoticeInbox />));
    assert.match(container.textContent ?? "", /Staff update/);
    assert.match(container.textContent ?? "", /Unread/);
    assert.doesNotMatch(container.textContent ?? "", /Please read this update/);

    await act(async () => click(container, "Staff update"));
    assert.match(container.textContent ?? "", /Please read this update/);
    await act(async () => click(container, "Mark as read"));
    assert.match(container.textContent ?? "", /Marked as read/);
    assert.match(container.textContent ?? "", /Read/);
    assert.equal(
      requested.filter((request) => request.startsWith("POST ")).length,
      1,
    );

    listMode = "historical";
    await act(async () => click(container, "Refresh"));
    assert.match(container.textContent ?? "", /read status unavailable/);
    await act(async () => click(container, "Staff update"));
    assert.match(container.textContent ?? "", /read status was not recorded/);
    assert.doesNotMatch(container.textContent ?? "", /Mark as read/);

    listMode = "empty";
    await act(async () => click(container, "Refresh"));
    assert.match(container.textContent ?? "", /No current notices/);
    assert.doesNotMatch(container.textContent ?? "", /Please read this update/);

    listMode = "denied";
    await act(async () => click(container, "Refresh"));
    assert.match(container.textContent ?? "", /do not have permission/);
    assert.doesNotMatch(container.textContent ?? "", /Staff update/);

    let releaseOldSite!: (response: Response) => void;
    let listRequests = 0;
    globalThis.fetch = async () => {
      listRequests += 1;
      if (listRequests === 1) {
        return new Promise<Response>((resolve) => {
          releaseOldSite = resolve;
        });
      }
      return Response.json({
        items: [{ ...notice, id: "new-site-notice", title: "New site notice" }],
        nextCursor: null,
      });
    };
    await act(async () => root.render(<StaffNoticeInbox key="old-site" />));
    await act(async () => root.render(<StaffNoticeInbox key="new-site" />));
    await act(async () => {
      releaseOldSite(Response.json({ items: [notice], nextCursor: null }));
    });
    assert.match(container.textContent ?? "", /New site notice/);
    assert.doesNotMatch(container.textContent ?? "", /Staff update/);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = originalFetch;
    setApiClientToken(null);
    container.remove();
  }
}

void run();
