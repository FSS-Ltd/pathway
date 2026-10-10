import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { setApiClientToken } from "@/lib/api-client";
import { NoticeAudiencePicker } from "./notice-audience-picker";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/notices/new",
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
  const container = document.body.appendChild(document.createElement("div"));
  const root = createRoot(container);
  const originalFetch = globalThis.fetch;
  const requested: string[] = [];
  setApiClientToken("notice-test-token");
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    requested.push(url.searchParams.get("scope") ?? "");
    assert.equal(url.pathname, "/ace/notices/targets");
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      "Bearer notice-test-token",
    );
    return Response.json({
      available: true,
      items: [{ id: "3b91e28c-b4e2-478e-96ec-f22643e96791", label: "Year 4" }],
    });
  };
  let chosenScope = "";
  let chosenTarget = "";

  try {
    await act(async () =>
      root.render(
        <NoticeAudiencePicker
          scope="SITE"
          targetId={null}
          pending={false}
          onScopeChange={(value) => {
            chosenScope = value;
          }}
          onTargetChange={(value) => {
            chosenTarget = value ?? "";
          }}
        />,
      ),
    );
    assert.match(container.textContent ?? "", /Whole site/);
    assert.deepEqual(requested, ["YEAR_BAND"]);

    await act(async () =>
      root.render(
        <NoticeAudiencePicker
          scope="YEAR_BAND"
          targetId={null}
          pending={false}
          onScopeChange={(value) => {
            chosenScope = value;
          }}
          onTargetChange={(value) => {
            chosenTarget = value ?? "";
          }}
        />,
      ),
    );
    assert.match(container.textContent ?? "", /Year 4/);
    const target = container.querySelector<HTMLSelectElement>(
      "#notice-audience-target",
    );
    assert.ok(target);
    await act(async () => {
      target.value = "3b91e28c-b4e2-478e-96ec-f22643e96791";
      target.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    });
    assert.equal(chosenTarget, "3b91e28c-b4e2-478e-96ec-f22643e96791");
    assert.equal(chosenScope, "");
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = originalFetch;
    setApiClientToken(null);
    container.remove();
  }
}

void run();
