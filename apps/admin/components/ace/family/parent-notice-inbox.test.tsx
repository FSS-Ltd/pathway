import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { setApiClientToken } from "@/lib/api-client";
import { ParentNoticesView } from "./parent-notice-inbox";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/ace/parent/sites/site-a/notices",
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
  title: "School update",
  publishedAt: "2026-10-10T10:00:00.000Z",
  expiresAt: null,
  deliveredAt: "2026-10-10T10:00:00.000Z",
  readAt: null,
  requiresAcknowledgement: true,
  acknowledgedAt: null,
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
  let mode: "filled" | "empty" | "denied" = "filled";
  setApiClientToken("parent-notice-token");
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    requested.push(`${init?.method ?? "GET"} ${url}`);
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      "Bearer parent-notice-token",
    );
    if (mode === "denied") return new Response("", { status: 404 });
    if (url.endsWith("/read")) {
      return Response.json({ readAt: "2026-10-10T11:00:00.000Z" });
    }
    if (url.endsWith("/acknowledge")) {
      return Response.json({
        readAt: "2026-10-10T11:00:00.000Z",
        acknowledgedAt: "2026-10-10T11:05:00.000Z",
      });
    }
    if (url.endsWith(`/${notice.id}`)) {
      return Response.json({ ...notice, body: "Please read this update." });
    }
    return Response.json({
      items: mode === "filled" ? [notice] : [],
      nextCursor: null,
    });
  };

  try {
    await act(async () => root.render(<ParentNoticesView siteId="site-a" />));
    assert.match(container.textContent ?? "", /School notices/);
    assert.match(container.textContent ?? "", /School update/);
    assert.match(container.textContent ?? "", /Unread/);
    assert.ok(
      requested.includes(
        "GET http://api.test/ace/parent/sites/site-a/notices?limit=25",
      ),
    );
    await act(async () => click(container, "School update"));
    assert.match(container.textContent ?? "", /Please read this update/);
    await act(async () => click(container, "Mark as read"));
    assert.match(container.textContent ?? "", /Marked as read/);
    assert.match(container.textContent ?? "", /Acknowledgement needed/);
    await act(async () => click(container, "Acknowledge notice"));
    assert.match(container.textContent ?? "", /Acknowledged/);
    assert.ok(
      requested.includes(
        `POST http://api.test/ace/parent/sites/site-a/notices/${notice.id}/read`,
      ),
    );
    assert.ok(
      requested.includes(
        `POST http://api.test/ace/parent/sites/site-a/notices/${notice.id}/acknowledge`,
      ),
    );

    mode = "empty";
    await act(async () => click(container, "Refresh"));
    assert.match(container.textContent ?? "", /No current notices/);

    mode = "denied";
    await act(async () => click(container, "Refresh"));
    assert.match(container.textContent ?? "", /school link or notice access/i);
    assert.doesNotMatch(container.textContent ?? "", /School update/);

    let releaseOldSite!: (response: Response) => void;
    let listRequests = 0;
    globalThis.fetch = async (input) => {
      listRequests += 1;
      if (listRequests === 1) {
        return new Promise<Response>((resolve) => {
          releaseOldSite = resolve;
        });
      }
      assert.match(String(input), /site-b/);
      return Response.json({
        items: [{ ...notice, id: "new-site-notice", title: "New site notice" }],
        nextCursor: null,
      });
    };
    await act(async () =>
      root.render(<ParentNoticesView key="site-a" siteId="site-a" />),
    );
    await act(async () =>
      root.render(<ParentNoticesView key="site-b" siteId="site-b" />),
    );
    await act(async () => {
      releaseOldSite(Response.json({ items: [notice], nextCursor: null }));
    });
    assert.match(container.textContent ?? "", /New site notice/);
    assert.doesNotMatch(container.textContent ?? "", /School update/);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = originalFetch;
    setApiClientToken(null);
    container.remove();
  }
}

void run();
