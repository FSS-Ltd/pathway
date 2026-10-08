import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { setApiClientToken } from "@/lib/api-client";
import { FamilyLandingView } from "./family-landing";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/ace/family",
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

async function run() {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const requested: string[] = [];
  let mode: "linked" | "empty" | "denied" = "linked";
  const originalFetch = globalThis.fetch;
  setApiClientToken("family-token");
  globalThis.fetch = async (input, init) => {
    requested.push(String(input));
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      "Bearer family-token",
    );
    if (mode === "denied") return new Response("", { status: 403 });
    return new Response(
      JSON.stringify({
        items:
          mode === "empty"
            ? []
            : [
                {
                  kind: "parent",
                  siteId: "school-one",
                  siteName: "Alpha School",
                  childId: "child-one",
                  childName: "Ari Alpha",
                },
                {
                  kind: "parent",
                  siteId: "school-one",
                  siteName: "Alpha School",
                  childId: "child-three",
                  childName: "Cia Alpha",
                },
                {
                  kind: "student",
                  siteId: "school-two",
                  siteName: "Bravo School",
                  childId: "child-two",
                  childName: "Bea Bravo",
                },
              ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  try {
    await act(async () =>
      root.render(<FamilyLandingView status="authenticated" />),
    );
    assert.deepEqual(requested, ["http://api.test/ace/family/contexts"]);
    assert.match(container.textContent ?? "", /Ari Alpha/);
    assert.match(container.textContent ?? "", /Cia Alpha/);
    assert.match(container.textContent ?? "", /Bea Bravo/);
    assert.deepEqual(
      Array.from(container.querySelectorAll("a[href*='/attendance']")).map(
        (anchor) => anchor.getAttribute("href"),
      ),
      [
        "/ace/parent/sites/school-one/children/child-one/attendance",
        "/ace/parent/sites/school-one/children/child-three/attendance",
        "/ace/student/sites/school-two/attendance",
      ],
    );
    assert.deepEqual(
      Array.from(container.querySelectorAll('a[href$="/messages"]')).map(
        (anchor) => anchor.getAttribute("href"),
      ),
      ["/ace/parent/sites/school-one/messages"],
    );

    mode = "denied";
    const requestCount = requested.length;
    await act(async () =>
      root.render(<FamilyLandingView status="unauthenticated" />),
    );
    assert.equal(requested.length, requestCount);
    assert.match(container.textContent ?? "", /Sign in to continue/);
    await act(async () =>
      root.render(<FamilyLandingView status="authenticated" />),
    );
    assert.match(container.textContent ?? "", /could not be verified/);
    assert.doesNotMatch(container.textContent ?? "", /Ari Alpha/);

    mode = "empty";
    const retry = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Try again",
    );
    assert.ok(retry);
    await act(async () => retry.click());
    assert.match(container.textContent ?? "", /No school links yet/);
    assert.equal(
      container.querySelectorAll("a[href*='/attendance']").length,
      0,
    );
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = originalFetch;
    setApiClientToken(null);
    container.remove();
  }
}

void run();
