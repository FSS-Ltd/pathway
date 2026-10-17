import "@/lib/register-test-styles";
import assert from "node:assert/strict";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import type {
  TrackerCategoryProgress,
  TrackerChecklistItem,
  TrackerTopic,
} from "@pathway/types";
import { ChecklistBrowser } from "./checklist-browser";

const dom = new JSDOM("<html><body></body></html>");
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

function category(topic: TrackerTopic): TrackerCategoryProgress {
  return {
    topic,
    applicable: 1,
    completed: 0,
    unresolved: 1,
    notApplicable: 1,
    stale: 0,
    overdue: 0,
    evidenceGaps: 0,
  };
}

function item(
  id: string,
  topic: TrackerTopic,
  applicability: TrackerChecklistItem["applicability"] = "APPLICABLE",
): TrackerChecklistItem {
  return {
    requirement: {
      id,
      version: 1,
      action: `Review ${id}`,
      topic,
      obligationClass: "STATUTORY_DUTY",
      applicabilityExplanation: "Applicable to the site",
      unknownExplanation: "Check the site profile",
      expectedEvidence: [],
      allowsNotApplicable: false,
      sources: [],
      signalKeys: [],
    },
    applicability,
    attestation: null,
    completed: false,
    stale: false,
    overdue: false,
    evidenceCount: 0,
    evidenceGap: false,
  };
}

async function run(): Promise<void> {
  const { createRoot } = await import("react-dom/client");
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ items: [], nextCursor: null }), {
      headers: { "Content-Type": "application/json" },
    });
  const categories = [category("premises_safety"), category("safeguarding")];
  const items = [
    item("fire precautions", "premises_safety"),
    item("premises scope", "premises_safety", "UNRESOLVED"),
    item("boarding facilities", "premises_safety", "NOT_APPLICABLE"),
    item("safeguarding policy", "safeguarding"),
    item("data records", "privacy_records"),
  ];
  const render = async (
    nextCategories = categories,
    nextItems = items,
  ): Promise<void> => {
    await act(async () =>
      root.render(
        <ChecklistBrowser
          categories={nextCategories}
          items={nextItems}
          profileVersion={1}
          canManage
          onChange={() => undefined}
        />,
      ),
    );
  };
  const topicButton = (label: string): HTMLButtonElement => {
    const button = [...host.querySelectorAll("button")].find((value) =>
      value.textContent?.startsWith(label),
    );
    assert.ok(button, `Topic button ${label} is available`);
    return button;
  };
  const panel = (label: string): HTMLElement => {
    const result = [
      ...host.querySelectorAll<HTMLElement>('[role="tabpanel"]'),
    ].find((value) => value.querySelector("h3")?.textContent === label);
    assert.ok(result, `Topic panel ${label} is available`);
    return result;
  };

  try {
    await render();
    assert.equal(
      panel("Premises Safety").querySelectorAll(":scope > div > details")
        .length,
      3,
    );
    assert.equal(
      panel("Premises Safety").querySelectorAll(
        ":scope > div:not([hidden]) > details",
      ).length,
      1,
      "only one action is visible",
    );
    assert.match(
      panel("Premises Safety").textContent ?? "",
      /Review premises scope/,
    );
    assert.match(
      panel("Premises Safety").textContent ?? "",
      /Review boarding facilities/,
    );
    assert.match(panel("Premises Safety").textContent ?? "", /Unresolved/);
    assert.match(panel("Premises Safety").textContent ?? "", /Not applicable/);
    assert.equal(panel("Safeguarding").hidden, true);
    const details = panel("Premises Safety").querySelector<HTMLDetailsElement>(
      ":scope > div:not([hidden]) > details",
    );
    assert.ok(details);
    await act(async () => {
      details.open = true;
      details.dispatchEvent(new Event("toggle"));
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    const notes = details.querySelector("textarea");
    assert.ok(notes);
    const valueSetter = Object.getOwnPropertyDescriptor(
      dom.window.HTMLTextAreaElement.prototype,
      "value",
    )?.set;
    assert.ok(valueSetter);
    await act(async () => {
      valueSetter.call(notes, "Keep this unsaved confirmation draft");
      notes.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
    assert.equal(
      topicButton("Premises Safety").getAttribute("aria-selected"),
      "true",
    );
    assert.match(topicButton("Premises Safety").textContent ?? "", /3$/);

    await act(async () => topicButton("Safeguarding").click());
    assert.equal(
      topicButton("Safeguarding").getAttribute("aria-selected"),
      "true",
    );
    assert.equal(
      topicButton("Premises Safety").getAttribute("aria-selected"),
      "false",
    );
    assert.equal(panel("Safeguarding").hidden, false);
    assert.equal(panel("Premises Safety").hidden, true);
    assert.equal(
      panel("Safeguarding").querySelectorAll(":scope > div > details").length,
      1,
    );
    await act(async () => topicButton("Premises Safety").click());
    assert.equal(panel("Premises Safety").hidden, false);
    assert.equal(
      details.querySelector("textarea")?.value,
      "Keep this unsaved confirmation draft",
    );
    assert.equal(details.open, true);
    await act(async () => topicButton("Safeguarding").click());
    await render();
    assert.equal(
      topicButton("Safeguarding").getAttribute("aria-selected"),
      "true",
    );

    await act(async () => topicButton("Privacy Records").click());
    assert.equal(panel("Privacy Records").hidden, false);
    assert.match(
      panel("Privacy Records").textContent ?? "",
      /Review data records/,
    );
    assert.equal(
      panel("Privacy Records").querySelectorAll(":scope > div > details")
        .length,
      1,
    );

    await render([category("activities")], []);
    assert.match(
      host.textContent ?? "",
      /No published actions are available for this topic/,
    );
    assert.equal(
      topicButton("Activities").getAttribute("aria-selected"),
      "true",
    );
    await render([], []);
    assert.match(
      host.textContent ?? "",
      /No published actions are available for the current profile/,
    );
    assert.equal(host.querySelectorAll("button").length, 0);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = previousFetch;
    host.remove();
  }
  console.log("Checklist browser tests passed");
}

void run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
