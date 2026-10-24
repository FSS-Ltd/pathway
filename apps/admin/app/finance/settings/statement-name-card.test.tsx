import "@/lib/register-test-styles";
import assert from "node:assert/strict";
import React, { act } from "react";
import { dom, click, deferred } from "../finance-assurance-test-support";
import { StatementNameCard } from "./statement-name-card";

const connected = {
  status: "CONNECTED",
  schoolName: "Example School",
  accountReference: "acct_school_a",
  descriptor: "EXAMPLE SCHOOL",
  checkedAt: "2026-10-24T01:00:00Z",
  canPrepare: true,
  livemode: false,
};
async function run() {
  const { createRoot } = await import("react-dom/client");
  const container = document.body.appendChild(document.createElement("div"));
  const root = createRoot(container);
  const originalFetch = globalThis.fetch;
  let requests = 0;
  let response = async () => Response.json(connected);
  const copied: string[] = [];
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: async (name: string) => {
        copied.push(name);
      },
    },
  });
  globalThis.fetch = async (_input, init) => {
    requests += 1;
    assert.equal(
      init?.method ?? "GET",
      "GET",
      "No provider or local mutations",
    );
    return response();
  };
  function edit(name: string) {
    const input = container.querySelector("input");
    assert.ok(input);
    const setter = Object.getOwnPropertyDescriptor(
      dom.window.HTMLInputElement.prototype,
      "value",
    )?.set;
    assert.ok(setter);
    setter.call(input, name);
    input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  }
  try {
    await act(async () => root.render(<StatementNameCard canManage />));
    assert.equal(requests, 1, "One initial provider read, no polling");
    assert.match(container.textContent ?? "", /Applied in Stripe · Sandbox/);
    assert.match(container.textContent ?? "", /unapplied draft/);
    assert.match(
      container.textContent ?? "",
      /does not change it or activate paid branding/,
    );
    const input = container.querySelector("input");
    assert.ok(input);
    assert.equal(
      input.labels?.[0]?.textContent,
      "Choose a card statement name",
    );
    await act(async () => edit("NEW SCHOOL"));
    await act(async () => click(container, "Copy draft name"));
    assert.deepEqual(copied, ["NEW SCHOOL"]);
    assert.match(container.textContent ?? "", /Save it in Stripe/);
    assert.match(container.textContent ?? "", /EXAMPLE SCHOOL/);
    assert.equal(requests, 1, "Copy never claims to save or contacts provider");
    await act(async () => edit("BAD*NAME"));
    assert.equal(input.getAttribute("aria-invalid"), "true");
    assert.match(container.textContent ?? "", /Enter a valid name to preview/);
    const copyButton = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Copy draft name",
    );
    assert.equal(copyButton?.disabled, true);
    await act(async () => root.render(<StatementNameCard canManage={false} />));
    assert.equal(
      container.querySelector("input"),
      null,
      "Revoked management removes preparation controls",
    );
    assert.equal(container.querySelector("a"), null);
    await act(async () => root.render(<StatementNameCard canManage />));
    response = async () =>
      Response.json({ ...connected, descriptor: "CONFIRMED SCHOOL" });
    await act(async () => click(container, "Check applied name"));
    assert.match(container.textContent ?? "", /CONFIRMED SCHOOL/);
    assert.match(
      container.querySelector(
        '[role="status"][aria-label="Statement name check"]',
      )?.textContent ?? "",
      /Stripe name checked: CONFIRMED SCHOOL/,
      "A completed check is announced to screen readers",
    );
    const pending = deferred<Response>();
    response = () => pending.promise;
    await act(async () => click(container, "Check applied name"));
    const checking = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Checking…",
    );
    assert.equal(
      checking?.disabled,
      true,
      "Repeated taps do not overlap provider reads",
    );
    const beforeUnmount = requests;
    await act(async () => root.render(<div>Finance access revoked</div>));
    await act(async () =>
      pending.resolve(
        Response.json({ ...connected, descriptor: "LATE PRIVATE NAME" }),
      ),
    );
    assert.doesNotMatch(container.textContent ?? "", /LATE PRIVATE NAME/);
    assert.equal(requests, beforeUnmount);
    response = async () => Response.json(connected);
    await act(async () => root.render(<StatementNameCard canManage />));
    response = async () => Response.json({}, { status: 403 });
    await act(async () => click(container, "Check applied name"));
    assert.match(container.textContent ?? "", /access is no longer available/);
    assert.doesNotMatch(
      container.textContent ?? "",
      /EXAMPLE SCHOOL|acct_school_a/,
    );
    assert.equal(container.querySelector("input"), null);
    response = async () => Response.json({ status: "DISCONNECTED" });
    await act(async () => click(container, "Check applied name"));
    assert.match(container.textContent ?? "", /account is disconnected/);
    assert.equal(container.querySelector("a"), null);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    globalThis.fetch = originalFetch;
    dom.window.close();
  }
}
void run();
