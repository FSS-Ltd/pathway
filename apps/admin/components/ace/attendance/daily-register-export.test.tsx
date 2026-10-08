import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { setApiClientToken } from "@/lib/api-client";
import { DailyRegisterExport } from "./daily-register-export";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/ace/attendance/daily",
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  HTMLInputElement: dom.window.HTMLInputElement,
  Text: dom.window.Text,
  Event: dom.window.Event,
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  configurable: true,
});

async function changeDate(container: HTMLElement, id: string, value: string) {
  const input = container.querySelector<HTMLInputElement>(`#${id}`);
  assert.ok(input);
  const setter = Object.getOwnPropertyDescriptor(
    dom.window.HTMLInputElement.prototype,
    "value",
  )?.set;
  assert.ok(setter);
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
}

async function click(container: HTMLElement, label: string) {
  const button = Array.from(container.querySelectorAll("button")).find(
    (item) => item.textContent?.trim() === label,
  );
  assert.ok(button, `expected button ${label}`);
  await act(async () => button.click());
}

async function run() {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const originalFetch = globalThis.fetch;
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  const originalClick = dom.window.HTMLAnchorElement.prototype.click;
  const downloads: string[] = [];
  const requests: string[] = [];
  let deny = false;
  let hold = false;
  let pendingSignal: AbortSignal | undefined;
  setApiClientToken("export-test-token");

  URL.createObjectURL = () => "blob:daily-export";
  URL.revokeObjectURL = () => undefined;
  dom.window.HTMLAnchorElement.prototype.click = function () {
    downloads.push(this.download);
  };
  globalThis.fetch = async (url, init) => {
    assert.equal(init?.credentials, "include");
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      "Bearer export-test-token",
    );
    const parsed = new URL(String(url));
    assert.equal(parsed.pathname, "/attendance/daily/export");
    requests.push(parsed.search);
    if (hold) {
      pendingSignal = init?.signal ?? undefined;
      return new Promise<Response>(() => undefined);
    }
    if (deny) return new Response(null, { status: 403 });
    return new Response("Date,Student ID\r\n", {
      status: 200,
      headers: { "Content-Type": "text/csv" },
    });
  };

  try {
    await act(async () =>
      root.render(<DailyRegisterExport date="2026-10-08" />),
    );
    assert.equal(
      container.querySelector<HTMLInputElement>("#daily-export-from")?.value,
      "2026-10-08",
    );
    await changeDate(container, "daily-export-from", "2026-09-01");
    assert.match(container.textContent ?? "", /31 days or fewer/);
    assert.equal(
      container.querySelector<HTMLButtonElement>("button")?.disabled,
      true,
    );

    await changeDate(container, "daily-export-from", "2026-10-07");
    await click(container, "Download CSV");
    assert.deepEqual(requests, ["?from=2026-10-07&to=2026-10-08"]);
    assert.deepEqual(downloads, [
      "nexsteps-ace-attendance-2026-10-07-2026-10-08.csv",
    ]);
    assert.match(container.textContent ?? "", /CSV download started/);

    deny = true;
    await click(container, "Download CSV");
    assert.match(
      container.querySelector('[role="alert"]')?.textContent ?? "",
      /cannot export daily attendance/,
    );
    assert.equal(downloads.length, 1);

    deny = false;
    hold = true;
    await act(async () => {
      const button = container.querySelector<HTMLButtonElement>("button");
      button?.click();
    });
    assert.ok(pendingSignal);
    assert.equal(pendingSignal.aborted, false);
    await act(async () => root.unmount());
    assert.equal(
      pendingSignal.aborted,
      true,
      "site switch or unmount cancels export",
    );
  } finally {
    if (container.hasChildNodes()) await act(async () => root.unmount());
    container.remove();
    globalThis.fetch = originalFetch;
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    dom.window.HTMLAnchorElement.prototype.click = originalClick;
    setApiClientToken(null);
  }
}

void run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
