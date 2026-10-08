import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { setApiClientToken } from "../../lib/api-client";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/parents/parent-a",
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
  const { GuardianAccessReviewCard } =
    await import("./guardian-access-review-card");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const originalFetch = globalThis.fetch;
  let signedIn = false;
  let approved = false;
  let approvals = 0;

  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.match(url.pathname, /^\/parents\/parent-a\/guardian-access/);
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      "Bearer reviewer-token",
    );
    if (init?.method === "POST") {
      approvals += 1;
      assert.equal(url.pathname.endsWith("/child-a"), true);
      assert.deepEqual(JSON.parse(String(init.body)), {
        reviewBasis: "SCHOOL_RECORDS",
        confirmedLegalAccess: true,
      });
      approved = true;
      return response({ id: "relationship-a", childId: "child-a" });
    }
    if (init?.method === "DELETE") {
      assert.equal(url.pathname.endsWith("/child-a"), true);
      assert.deepEqual(JSON.parse(String(init.body)), {
        reason: "Legal access withdrawn",
      });
      approved = false;
      return response({ id: "relationship-a", childId: "child-a" });
    }
    return response({
      parentId: "parent-a",
      hasVerifiedSignIn: signedIn,
      parentPortalEnabled: false,
      children: [
        {
          id: "child-a",
          fullName: "Sam Child",
          isGuest: false,
          hasFullAccess: approved,
        },
      ],
    });
  };
  setApiClientToken("reviewer-token");

  try {
    await act(async () =>
      root.render(<GuardianAccessReviewCard parentId="parent-a" />),
    );
    assert.match(container.textContent ?? "", /must sign in/);
    const reviewButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Review access"),
    );
    assert.ok(reviewButton?.disabled);

    signedIn = true;
    const refresh = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Refresh"),
    );
    assert.ok(refresh);
    await act(async () => refresh.click());
    const enabledReview = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Review access"),
    );
    assert.ok(enabledReview && !enabledReview.disabled);
    await act(async () => enabledReview.click());
    const approveButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Approve full access"),
    );
    assert.ok(approveButton?.disabled);
    const confirmation = container.querySelector<HTMLInputElement>(
      'input[type="checkbox"]',
    );
    assert.ok(confirmation);
    await act(async () => confirmation.click());
    assert.equal(approveButton.disabled, false);
    await act(async () => approveButton.click());
    assert.equal(approvals, 1);
    assert.match(container.textContent ?? "", /Full access approved/);

    const revokeButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Revoke access"),
    );
    assert.ok(revokeButton);
    await act(async () => revokeButton.click());
    const confirmRevocation = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Confirm revocation"),
    );
    assert.ok(confirmRevocation?.disabled);
    const reason = container.querySelector<HTMLTextAreaElement>("textarea");
    assert.ok(reason);
    const setter = Object.getOwnPropertyDescriptor(
      dom.window.HTMLTextAreaElement.prototype,
      "value",
    )?.set;
    assert.ok(setter);
    await act(async () => {
      setter.call(reason, "Legal access withdrawn");
      reason.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
    assert.equal(confirmRevocation.disabled, false);
    await act(async () => confirmRevocation.click());
    assert.doesNotMatch(container.textContent ?? "", /Full access approved/);
    assert.match(container.textContent ?? "", /Review access/);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = originalFetch;
    setApiClientToken(null);
    container.remove();
  }
}

void run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
