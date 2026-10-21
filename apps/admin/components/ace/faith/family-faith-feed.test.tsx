import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { setApiClientToken } from "@/lib/api-client";
import { submitFamilyFaithReflection } from "@/lib/ace-faith-api";
import { FamilyFaithFeedView } from "./family-faith-feed";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/ace/family",
});
Object.assign(globalThis, {
  window: dom.window,
  self: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  HTMLTextAreaElement: dom.window.HTMLTextAreaElement,
  HTMLFormElement: dom.window.HTMLFormElement,
  Node: dom.window.Node,
  Text: dom.window.Text,
  Event: dom.window.Event,
  MouseEvent: dom.window.MouseEvent,
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  configurable: true,
});

async function run() {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  let submitted = false;
  setApiClientToken("faith-family-token");
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    calls.push(`${init?.method ?? "GET"} ${url}`);
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      "Bearer faith-family-token",
    );
    if (url.includes("/feed?")) {
      return Response.json({
        displayLabel: "Reflection Room",
        reflectionsEnabled: true,
        nextCursor: null,
        items: [
          {
            id: "reading-one",
            versionId: "version-one",
            title: "A shared reading",
            publishedAt: "2026-10-21T00:00:00.000Z",
            contentPayload: {
              body: "Read and consider.",
              reflectionPrompt: "What did you learn?",
            },
          },
        ],
      });
    }
    if (url.includes("/reflections")) {
      if (init?.method === "POST") {
        submitted = true;
        return Response.json({ id: "reflection-one" });
      }
      return Response.json({
        items: submitted
          ? [
              {
                id: "reflection-one",
                text: "Kindness matters.",
                moderationStatus: "PENDING",
              },
            ]
          : [],
        nextCursor: null,
      });
    }
    if (url.includes("/read?")) {
      return Response.json({
        id: "receipt-one",
        readAt: "2026-10-21T00:00:00.000Z",
      });
    }
    throw new Error(`Unexpected request: ${url}`);
  };

  try {
    await act(async () =>
      root.render(
        <FamilyFaithFeedView
          siteId="site-one"
          childId="child-one"
          status="authenticated"
        />,
      ),
    );
    assert.match(container.textContent ?? "", /Reflection Room/);
    assert.equal(
      container.querySelector("h1")?.textContent?.trim(),
      "Reflection Room",
    );
    await act(async () =>
      container.querySelector<HTMLButtonElement>("button")?.click(),
    );
    assert.equal(
      container.querySelector("h1")?.textContent?.trim(),
      "A shared reading",
    );
    assert.equal(document.activeElement, container.querySelector("h1"));
    assert.match(container.textContent ?? "", /Read and consider/);
    assert.equal(container.querySelector("textarea"), null);
    assert.ok(calls.some((call) => call.includes("childId=child-one")));

    await act(async () =>
      root.render(
        <FamilyFaithFeedView
          key="student"
          siteId="site-one"
          status="authenticated"
        />,
      ),
    );
    await act(async () =>
      container.querySelector<HTMLButtonElement>("button")?.click(),
    );
    const textarea = container.querySelector<HTMLTextAreaElement>("textarea");
    assert.ok(textarea);
    assert.equal(textarea.maxLength, 5000);
    assert.ok(
      container.querySelector<HTMLButtonElement>('button[type="submit"]')
        ?.disabled,
    );
    const markRead = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Mark as read",
    );
    assert.ok(markRead);
    await act(async () => markRead.click());
    assert.match(container.textContent ?? "", /Marked as read/);
    assert.ok(
      calls.some(
        (call) =>
          call.startsWith("POST ") && call.includes("/read?siteId=site-one"),
      ),
    );
    await submitFamilyFaithReflection(
      "site-one",
      "reading-one",
      "Kindness matters.",
    );
    assert.ok(
      calls.some(
        (call) =>
          call.startsWith("POST ") &&
          call.includes("/reflections?siteId=site-one"),
      ),
    );
    await act(async () =>
      root.render(
        <FamilyFaithFeedView
          key="student-submitted"
          siteId="site-one"
          status="authenticated"
        />,
      ),
    );
    await act(async () =>
      container.querySelector<HTMLButtonElement>("button")?.click(),
    );
    assert.equal(container.querySelector("textarea"), null);
    assert.match(container.textContent ?? "", /sent to your school for review/);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = originalFetch;
    setApiClientToken(null);
    container.remove();
  }
}

void run();
