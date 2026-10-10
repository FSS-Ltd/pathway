import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import {
  AdminBehaviourApiError,
  type AdminBehaviourEntry,
  type AdminDemeritStatus,
  type AdminDemeritOverrideInput,
} from "@/lib/api-client";
import { BehaviourStageReview } from "./behaviour-stage-review";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost",
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  HTMLInputElement: dom.window.HTMLInputElement,
  HTMLTextAreaElement: dom.window.HTMLTextAreaElement,
  HTMLSelectElement: dom.window.HTMLSelectElement,
  HTMLButtonElement: dom.window.HTMLButtonElement,
  HTMLFormElement: dom.window.HTMLFormElement,
  Node: dom.window.Node,
  Event: dom.window.Event,
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  configurable: true,
});

const child = {
  id: "11111111-1111-4111-8111-111111111111",
  fullName: "Jordan Smith",
};
const today = new Date().toISOString().slice(0, 10);
let currentStage = 1;
let policyAvailable = true;
let reviewerAllowed = true;
let requestCount = 0;
let saved = 0;
let conflict = true;
const commands: AdminDemeritOverrideInput[] = [];
const reviewId = "55555555-5555-4555-8555-555555555555";
const originalEntryId = "66666666-6666-4666-8666-666666666666";
const correctedEntry: AdminBehaviourEntry = {
  id: "77777777-7777-4777-8777-777777777777",
  childId: child.id,
  category: "conduct",
  categoryPolicyVersion: 4,
  categoryIsSerious: false,
  type: "DEMERIT",
  visibility: "SENSITIVE",
  pointsDelta: -2,
  occurredAt: new Date().toISOString(),
  recordedByUserId: "88888888-8888-4888-8888-888888888888",
  reason: "Corrected current reason",
  note: "Restricted follow-up",
  correctsBehaviourEntryId: originalEntryId,
  createdAt: new Date().toISOString(),
};

const status = (): AdminDemeritStatus | null =>
  policyAvailable
    ? {
        childId: child.id,
        date: today,
        policyVersion: 4,
        stage: currentStage,
        stageLabel: currentStage === 1 ? "Site review" : "Guardian notice",
        action: currentStage === 1 ? "review" : "notify",
        requiresNote: false,
        headReview: false,
        manualStage: currentStage === 2 ? 2 : null,
        manualExpiresAt: null,
      }
    : null;

const loaders = {
  loadStatus: async () => status(),
  loadRequests: async (_childId: string, cursor?: string) => {
    requestCount += 1;
    if (!reviewerAllowed) throw new AdminBehaviourApiError("Denied", 403);
    if (cursor)
      return {
        items: [
          {
            id: "33333333-3333-4333-8333-333333333333",
            childId: child.id,
            behaviourEntryId: null,
            demeritStageOverrideId: "44444444-4444-4444-8444-444444444444",
            kind: "HEAD" as const,
            stage: 3,
            policyVersion: 4,
            requestedAt: new Date().toISOString(),
          },
        ],
        nextCursor: null,
      };
    return {
      items: [
        {
          id: reviewId,
          childId: child.id,
          behaviourEntryId: originalEntryId,
          demeritStageOverrideId: null,
          kind: "HEAD" as const,
          stage: 3,
          policyVersion: 4,
          requestedAt: new Date().toISOString(),
        },
      ],
      nextCursor: "22222222-2222-4222-8222-222222222222",
    };
  },
  loadFact: async (requestId: string) => {
    assert.equal(requestId, reviewId);
    if (!reviewerAllowed) throw new AdminBehaviourApiError("Denied", 403);
    return { entry: correctedEntry };
  },
  saveOverride: async (input: AdminDemeritOverrideInput) => {
    commands.push(input);
    if (conflict) throw new AdminBehaviourApiError("Conflict", 409);
    currentStage = 2;
    return {
      id: "44444444-4444-4444-8444-444444444444",
      stage: 2,
      expiresAt: new Date().toISOString(),
      duplicate: false,
    };
  },
  onSaved: async () => {
    saved += 1;
  },
};

function element<T extends Element>(
  container: HTMLElement,
  selector: string,
): T {
  const found = container.querySelector<T>(selector);
  assert.ok(found, `expected ${selector}`);
  return found;
}

async function change(
  control: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: string,
) {
  const setter = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(control),
    "value",
  )?.set;
  assert.ok(setter);
  await act(async () => {
    setter.call(control, value);
    control.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    control.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  });
}

async function run() {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const view = (
    canSensitive: boolean,
    canManagePolicy: boolean,
    refreshKey = 0,
  ) => (
    <BehaviourStageReview
      children={[child]}
      siteTimeZone="UTC"
      canSensitive={canSensitive}
      canManagePolicy={canManagePolicy}
      refreshKey={refreshKey}
      {...loaders}
    />
  );
  try {
    await act(async () => root.render(view(false, true)));
    assert.match(
      container.textContent ?? "",
      /require sensitive behaviour access/,
    );
    assert.equal(container.querySelector("#behaviour-stage-child"), null);

    await act(async () => root.render(view(true, false)));
    await change(
      element<HTMLSelectElement>(container, "#behaviour-stage-child"),
      child.id,
    );
    assert.match(container.textContent ?? "", /Site review/);
    assert.equal(
      container.querySelector('form[aria-label="Escalate demerit stage"]'),
      null,
    );
    assert.equal(
      requestCount,
      0,
      "does not probe review requests without manager permission",
    );

    await act(async () => root.render(view(true, true)));
    assert.ok(
      container.querySelector('form[aria-label="Escalate demerit stage"]'),
    );
    await act(async () =>
      element<HTMLFormElement>(
        container,
        'form[aria-label="Escalate demerit stage"]',
      ).dispatchEvent(
        new dom.window.Event("submit", { bubbles: true, cancelable: true }),
      ),
    );
    assert.match(container.textContent ?? "", /Enter a reason/);
    await change(
      element<HTMLTextAreaElement>(container, "#behaviour-stage-reason"),
      "Escalated for follow-up",
    );
    await act(async () =>
      element<HTMLFormElement>(
        container,
        'form[aria-label="Escalate demerit stage"]',
      ).dispatchEvent(
        new dom.window.Event("submit", { bubbles: true, cancelable: true }),
      ),
    );
    assert.match(container.textContent ?? "", /stage or policy changed/);
    assert.equal(commands.length, 1);
    assert.equal(commands[0]?.expectedPolicyVersion, 4);
    assert.equal(commands[0]?.stage, 2);
    assert.equal(commands[0]?.reason, "Escalated for follow-up");

    conflict = false;
    await change(
      element<HTMLTextAreaElement>(container, "#behaviour-stage-reason"),
      "Escalated after review",
    );
    assert.ok(
      container.querySelector('form[aria-label="Escalate demerit stage"]'),
      container.textContent ?? "",
    );
    await act(async () =>
      element<HTMLFormElement>(
        container,
        'form[aria-label="Escalate demerit stage"]',
      ).dispatchEvent(
        new dom.window.Event("submit", { bubbles: true, cancelable: true }),
      ),
    );
    assert.equal(saved, 1);
    assert.notEqual(commands[0]?.idempotencyKey, commands[1]?.idempotencyKey);
    assert.match(container.textContent ?? "", /Escalation saved/);
    assert.match(container.textContent ?? "", /Guardian notice/);

    const viewFact = [
      ...container.querySelectorAll<HTMLButtonElement>("button"),
    ].find((button) => button.textContent?.includes("View current fact"));
    assert.ok(viewFact);
    await act(async () => viewFact.click());
    assert.match(container.textContent ?? "", /Current corrected fact/);
    assert.match(container.textContent ?? "", /Corrected current reason/);
    const hideFact = [
      ...container.querySelectorAll<HTMLButtonElement>("button"),
    ].find((button) => button.textContent?.includes("Hide current fact"));
    assert.ok(hideFact);
    assert.equal(hideFact.getAttribute("aria-expanded"), "true");
    await act(async () => hideFact.click());
    assert.equal(
      container.textContent?.includes("Corrected current reason"),
      false,
    );

    const more = element<HTMLButtonElement>(container, "button");
    assert.ok(more);
    const loadMore = [
      ...container.querySelectorAll<HTMLButtonElement>("button"),
    ].find((button) => button.textContent?.includes("Load more requests"));
    assert.ok(loadMore);
    await act(async () => loadMore.click());
    assert.match(container.textContent ?? "", /Head review · Stage 3/);

    reviewerAllowed = false;
    const reopenFact = [
      ...container.querySelectorAll<HTMLButtonElement>("button"),
    ].find((button) => button.textContent?.includes("View current fact"));
    assert.ok(reopenFact);
    await act(async () => reopenFact.click());
    assert.match(container.textContent ?? "", /current Head or Lead role/);
    assert.equal(
      container.textContent?.includes("Corrected current reason"),
      false,
    );
    await act(async () => root.render(view(true, true, 1)));
    assert.match(container.textContent ?? "", /current Head or Lead role/);
    assert.equal(
      container.querySelector('form[aria-label="Escalate demerit stage"]'),
      null,
    );

    policyAvailable = false;
    await act(async () => root.render(view(true, true, 2)));
    assert.match(container.textContent ?? "", /No demerit policy applies/);
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
}

void run();
