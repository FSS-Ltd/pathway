import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { setApiClientToken } from "@/lib/api-client";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/children/child-a",
});
Object.assign(globalThis, {
  window: dom.window,
  self: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  Event: dom.window.Event,
  MouseEvent: dom.window.MouseEvent,
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  configurable: true,
});

function response(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

async function run(): Promise<void> {
  const { createRoot } = await import("react-dom/client");
  const { StudentInviteCard } = await import("./student-invite-card");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const originalFetch = globalThis.fetch;
  const originalConfirm = dom.window.confirm;
  let enabled = false;
  let invites: unknown[] = [];
  let sent = 0;
  let resent = 0;
  let allowResend = false;
  dom.window.confirm = (message) => !message.includes("Resend") || allowResend;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      "Bearer admin-token",
    );
    if (url.pathname === "/student-invites/policy") {
      if (init?.method === "PUT") {
        enabled = JSON.parse(String(init.body)).enabled as boolean;
      }
      return response({ enabled });
    }
    if (url.pathname === "/student-invites/children/child-a/access") {
      return response({ active: null });
    }
    if (url.pathname === "/student-invites/invite-a/resend") {
      assert.deepEqual(JSON.parse(String(init?.body)), {
        confirmedSchoolApproval: true,
      });
      resent += 1;
      return response(invites[0]);
    }
    assert.equal(url.pathname, "/student-invites/children/child-a");
    if (init?.method === "POST") {
      sent += 1;
      assert.deepEqual(JSON.parse(String(init.body)), {
        email: "student@example.org",
        confirmedSchoolApproval: true,
      });
      const invite = {
        id: "invite-a",
        email: "student@example.org",
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        acceptedAt: null,
        revokedAt: null,
      };
      invites = [invite];
      return response(invite);
    }
    return response(invites);
  };
  setApiClientToken("admin-token");

  try {
    await act(async () => root.render(<StudentInviteCard childId="child-a" />));
    assert.match(
      container.textContent ?? "",
      /Enable the school student portal/,
    );
    assert.equal(container.querySelector('input[type="email"]'), null);
    const enableButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Enable portal"),
    );
    assert.ok(enableButton);
    await act(async () => enableButton.click());
    assert.match(container.textContent ?? "", /Enabled for this school site/);
    const sendButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Send student invitation"),
    );
    assert.ok(sendButton?.disabled);
    const email = container.querySelector<HTMLInputElement>(
      'input[type="email"]',
    );
    const approval = container.querySelector<HTMLInputElement>(
      'input[type="checkbox"]',
    );
    assert.ok(email && approval);
    const setter = Object.getOwnPropertyDescriptor(
      dom.window.HTMLInputElement.prototype,
      "value",
    )?.set;
    assert.ok(setter);
    await act(async () => {
      setter.call(email, "student@example.org");
      email.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
      approval.click();
    });
    assert.equal(sendButton.disabled, false);
    await act(async () => sendButton.click());
    assert.equal(sent, 1);
    assert.match(container.textContent ?? "", /student@example.org/);
    assert.match(container.textContent ?? "", /Pending/);
    const resendButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Resend"),
    );
    assert.ok(resendButton);
    await act(async () => resendButton.click());
    assert.equal(resent, 0);
    allowResend = true;
    await act(async () => resendButton.click());
    assert.equal(resent, 1);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = originalFetch;
    dom.window.confirm = originalConfirm;
    setApiClientToken(null);
    container.remove();
  }
}

void run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
