import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { setApiClientToken } from "../../lib/api-client";

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
  const { GuardianInviteCard } = await import("./guardian-invite-card");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const originalFetch = globalThis.fetch;
  const originalConfirm = dom.window.confirm;
  let invites: unknown[] = [];
  let resent = 0;
  dom.window.confirm = () => true;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      "Bearer admin-token",
    );
    if (url.pathname === "/family-invites/guardian/children/child-a") {
      if (init?.method === "POST") {
        assert.deepEqual(JSON.parse(String(init.body)), {
          email: "guardian@example.org",
          reviewBasis: "SCHOOL_RECORDS",
          confirmedLegalAccess: true,
        });
        const invite = {
          id: "invite-a",
          email: "guardian@example.org",
          expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
          acceptedAt: null,
          revokedAt: null,
        };
        invites = [invite];
        return response(invite);
      }
      return response(invites);
    }
    assert.equal(url.pathname, "/family-invites/guardian/invite-a/resend");
    assert.deepEqual(JSON.parse(String(init?.body)), {
      reviewBasis: "LEGAL_DOCUMENT",
      confirmedLegalAccess: true,
    });
    resent += 1;
    return response(invites[0]);
  };
  setApiClientToken("admin-token");

  try {
    await act(async () =>
      root.render(<GuardianInviteCard childId="child-a" />),
    );
    assert.match(container.textContent ?? "", /No invitations for this child/);
    const sendButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Send invitation"),
    );
    const email = container.querySelector<HTMLInputElement>(
      'input[type="email"]',
    );
    const createApproval = container.querySelector<HTMLInputElement>(
      'input[type="checkbox"]',
    );
    assert.ok(sendButton?.disabled && email && createApproval);
    const setter = Object.getOwnPropertyDescriptor(
      dom.window.HTMLInputElement.prototype,
      "value",
    )?.set;
    assert.ok(setter);
    await act(async () => {
      setter.call(email, "guardian@example.org");
      email.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
      createApproval.click();
    });
    assert.equal(sendButton.disabled, false);
    await act(async () => sendButton.click());
    assert.match(container.textContent ?? "", /guardian@example.org/);
    const resendButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Resend",
    );
    assert.ok(resendButton);
    await act(async () => resendButton.click());
    const confirmButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Confirm and resend"),
    );
    assert.ok(confirmButton?.disabled);
    const cancelButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Cancel",
    );
    assert.ok(cancelButton);
    await act(async () => cancelButton.click());
    assert.equal(document.activeElement, resendButton);
    await act(async () => resendButton.click());
    const reopenedConfirmButton = [
      ...container.querySelectorAll("button"),
    ].find((button) => button.textContent?.includes("Confirm and resend"));
    assert.ok(reopenedConfirmButton?.disabled);
    const reviewSelect = container.querySelector<HTMLSelectElement>(
      'select[id^="guardian-resend-basis"]',
    );
    const reviewApproval = [
      ...container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
    ][1];
    assert.ok(reviewSelect && reviewApproval);
    await act(async () => {
      reviewSelect.value = "LEGAL_DOCUMENT";
      reviewSelect.dispatchEvent(
        new dom.window.Event("change", { bubbles: true }),
      );
      reviewApproval.click();
    });
    assert.equal(reopenedConfirmButton.disabled, false);
    await act(async () => reopenedConfirmButton.click());
    assert.equal(resent, 1);
    assert.doesNotMatch(container.textContent ?? "", /Confirm and resend/);
    assert.equal(document.activeElement, resendButton);
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
