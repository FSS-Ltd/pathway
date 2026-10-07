import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { notifyActiveSiteChanged } from "@/lib/active-site-events";
import type { AceSettings } from "@/lib/ace-settings-api";
import { PacePolicySettings } from "./pace-policy-settings";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/ace/settings/academic",
});

Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  HTMLInputElement: dom.window.HTMLInputElement,
  HTMLFormElement: dom.window.HTMLFormElement,
  Node: dom.window.Node,
  Text: dom.window.Text,
  Event: dom.window.Event,
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  configurable: true,
});

const firstPolicy = {
  id: "policy-a",
  version: 4,
  selfTestPassingScore: 80,
  paceTestPassingScore: 80,
  maxAssessmentsPerDay: 2,
  allowSamePaceSameDay: false,
  effectiveFrom: "2026-09-01T00:00:00.000Z",
};

const firstSite: AceSettings = {
  timezone: "Europe/London",
  pacePolicy: firstPolicy,
  demeritPolicy: { version: 2 },
};

const secondSite: AceSettings = {
  timezone: "Europe/Paris",
  pacePolicy: {
    ...firstPolicy,
    id: "policy-b",
    version: 1,
    selfTestPassingScore: 70,
  },
  demeritPolicy: null,
};

type Root = { render: (node: React.ReactNode) => void; unmount: () => void };

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function input(container: HTMLElement, id: string): HTMLInputElement {
  const element = container.querySelector<HTMLInputElement>(`#${id}`);
  assert.ok(element, `expected #${id}`);
  return element;
}

async function changeInput(element: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    dom.window.HTMLInputElement.prototype,
    "value",
  )?.set;
  assert.ok(setter);
  await act(async () => {
    setter.call(element, value);
    element.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
}

async function submit(container: HTMLElement) {
  const form = container.querySelector("form");
  assert.ok(form);
  await act(async () => {
    form.dispatchEvent(
      new dom.window.Event("submit", { bubbles: true, cancelable: true }),
    );
  });
}

async function render(root: Root, canManage: boolean) {
  await act(async () =>
    root.render(<PacePolicySettings canManage={canManage} />),
  );
}

async function run() {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const originalFetch = globalThis.fetch;
  let activeSettings = firstSite;
  let nextGet: Promise<Response> | null = null;
  let conflictNext = false;
  const writes: unknown[] = [];

  globalThis.fetch = async (url, init) => {
    assert.equal(url, "http://api.test/ace/settings");
    assert.equal(init?.credentials, "include");
    if (init?.method === "PUT") {
      writes.push(JSON.parse(String(init.body)) as unknown);
      if (conflictNext) {
        conflictNext = false;
        return jsonResponse(
          { message: "PACE policy changed before this update" },
          409,
        );
      }
      const policy = activeSettings.pacePolicy;
      assert.ok(policy);
      activeSettings = {
        ...activeSettings,
        pacePolicy: {
          ...policy,
          version: policy.version + 1,
        },
      };
      return jsonResponse(activeSettings);
    }
    if (nextGet) {
      const pending = nextGet;
      nextGet = null;
      return pending;
    }
    return jsonResponse(activeSettings);
  };

  try {
    await render(root, false);
    assert.match(container.textContent ?? "", /Version 4/);
    assert.match(
      container.textContent ?? "",
      /ACE settings management access is required/,
    );
    assert.equal(input(container, "pace-self-test-score").disabled, true);
    assert.equal(container.querySelector('button[type="submit"]'), null);
    await submit(container);
    assert.equal(writes.length, 0, "read-only staff cannot send policy writes");

    await render(root, true);
    await submit(container);
    assert.match(
      container.textContent ?? "",
      /Enter a reason of up to 1,000 characters/,
    );
    assert.equal(
      input(container, "pace-policy-reason").getAttribute("aria-invalid"),
      "true",
    );
    await changeInput(input(container, "pace-self-test-score"), "101");
    await changeInput(
      input(container, "pace-policy-reason"),
      "Reviewed site PACE policy",
    );
    await submit(container);
    assert.match(
      container.textContent ?? "",
      /whole-number score from 0 to 100/,
    );
    assert.equal(writes.length, 0, "invalid pass marks cannot be saved");
    await changeInput(input(container, "pace-self-test-score"), "85");
    await submit(container);
    assert.deepEqual(writes[0], {
      reason: "Reviewed site PACE policy",
      expectedPacePolicyVersion: 4,
      expectedDemeritPolicyVersion: 2,
      pacePolicy: {
        selfTestPassingScore: 85,
        paceTestPassingScore: 80,
        maxAssessmentsPerDay: 2,
        allowSamePaceSameDay: false,
      },
    });
    assert.match(container.textContent ?? "", /Version 5/);
    assert.match(
      container.textContent ?? "",
      /PACE policy saved for this site/,
    );

    conflictNext = true;
    await changeInput(input(container, "pace-policy-reason"), "Review again");
    await submit(container);
    assert.match(container.textContent ?? "", /Settings changed elsewhere/);
    assert.equal(input(container, "pace-self-test-score").disabled, true);
    activeSettings = {
      ...firstSite,
      pacePolicy: { ...firstPolicy, version: 6 },
    };
    const reload = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Reload PACE policy"),
    );
    assert.ok(reload);
    await act(async () => reload.click());
    assert.match(container.textContent ?? "", /Version 6/);

    const pending = deferred<Response>();
    activeSettings = secondSite;
    nextGet = pending.promise;
    await act(async () => notifyActiveSiteChanged(dom.window));
    assert.doesNotMatch(container.textContent ?? "", /Version 6/);
    assert.equal(input(container, "pace-self-test-score").disabled, true);
    await act(async () => pending.resolve(jsonResponse(secondSite)));
    assert.match(container.textContent ?? "", /Version 1/);
    assert.equal(input(container, "pace-self-test-score").value, "70");
    assert.match(container.textContent ?? "", /Europe\/Paris/);

    const oldSiteResponse = deferred<Response>();
    nextGet = oldSiteResponse.promise;
    await act(async () => notifyActiveSiteChanged(dom.window));
    activeSettings = firstSite;
    await act(async () => notifyActiveSiteChanged(dom.window));
    assert.match(container.textContent ?? "", /Version 4/);
    await act(async () => oldSiteResponse.resolve(jsonResponse(secondSite)));
    assert.match(container.textContent ?? "", /Version 4/);
    assert.equal(input(container, "pace-self-test-score").value, "80");
  } finally {
    globalThis.fetch = originalFetch;
    await act(async () => root.unmount());
    container.remove();
  }
}

void run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
