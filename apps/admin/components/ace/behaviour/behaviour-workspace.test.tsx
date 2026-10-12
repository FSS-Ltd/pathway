import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import type {
  AdminBehaviourBatchInput,
  AdminBehaviourCategory,
  AdminBehaviourEntry,
} from "@/lib/api-client";
import { BehaviourBatchForm } from "./behaviour-batch-form";
import { BehaviourRecentWorkspace } from "./behaviour-recent-workspace";
import { BehaviourTrends } from "./behaviour-trends";
import { BehaviourWorkspaceTabs } from "./behaviour-workspace-tabs";
import { historyDateBounds } from "./behaviour-date-range";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost",
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  HTMLInputElement: dom.window.HTMLInputElement,
  HTMLSelectElement: dom.window.HTMLSelectElement,
  HTMLFormElement: dom.window.HTMLFormElement,
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
const category: AdminBehaviourCategory = {
  code: "kindness",
  label: "Kindness",
  type: "MERIT",
  visibility: "GENERAL",
  isActive: true,
  isSerious: false,
  sortOrder: 1,
};
const entry: AdminBehaviourEntry = {
  id: "22222222-2222-4222-8222-222222222222",
  childId: child.id,
  category: category.code,
  categoryPolicyVersion: 1,
  categoryIsSerious: false,
  type: "MERIT",
  visibility: "GENERAL",
  pointsDelta: 1,
  occurredAt: "2026-10-11T09:00:00.000Z",
  recordedByUserId: "33333333-3333-4333-8333-333333333333",
  reason: "Helped a friend",
  note: null,
  correctsBehaviourEntryId: null,
  createdAt: "2026-10-11T09:01:00.000Z",
};

function control<T extends Element>(
  container: HTMLElement,
  selector: string,
): T {
  const found = container.querySelector<T>(selector);
  assert.ok(found, `Expected ${selector}`);
  return found;
}

async function change(
  element: HTMLInputElement | HTMLSelectElement,
  value: string,
) {
  const setter = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(element),
    "value",
  )?.set;
  assert.ok(setter);
  await act(async () => {
    setter.call(element, value);
    element.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    element.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  });
}

async function click(element: HTMLElement) {
  await act(async () => element.click());
}

async function submit(element: HTMLFormElement) {
  await act(async () =>
    element.dispatchEvent(
      new dom.window.Event("submit", {
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
}

async function run() {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const originalFetch = globalThis.fetch;
  try {
    const attempts: AdminBehaviourBatchInput[] = [];
    let saved = 0;
    await act(async () =>
      root.render(
        <BehaviourBatchForm
          children={[child]}
          categories={[category]}
          canSensitive={false}
          siteTimeZone="Europe/London"
          disabled={false}
          onSave={async (input) => {
            attempts.push(input);
            if (attempts.length === 1) throw new Error("Temporary failure");
            return { entries: [entry, entry], duplicate: false };
          }}
          onSuccess={() => {
            saved += 1;
          }}
        />,
      ),
    );
    await submit(
      control(container, 'form[aria-label="Record behaviour batch"]'),
    );
    assert.match(container.textContent ?? "", /Choose at least one learner/);
    await click(control(container, 'input[type="checkbox"]'));
    await change(
      control(container, 'select[id^="batch-category-"]'),
      "kindness",
    );
    await change(control(container, 'input[id^="batch-quantity-"]'), "51");
    assert.match(container.textContent ?? "", /Reduce learners or quantities/);
    assert.equal(
      control<HTMLButtonElement>(container, 'button[type="submit"]').disabled,
      true,
    );
    await change(control(container, 'input[id^="batch-quantity-"]'), "2");
    await change(
      control(container, 'input[id^="batch-reason-"]'),
      "Helped a friend",
    );
    await submit(
      control(container, 'form[aria-label="Record behaviour batch"]'),
    );
    assert.match(container.textContent ?? "", /Temporary failure/);
    await submit(
      control(container, 'form[aria-label="Record behaviour batch"]'),
    );
    assert.equal(attempts.length, 2);
    assert.equal(attempts[0]?.idempotencyKey, attempts[1]?.idempotencyKey);
    assert.deepEqual(attempts[1]?.childIds, [child.id]);
    assert.equal(attempts[1]?.entries[0]?.quantity, 2);
    assert.equal(saved, 1);
    assert.match(container.textContent ?? "", /2 behaviour facts recorded/);

    let selectedTab: "record" | "trends" = "record";
    await act(async () =>
      root.render(
        <BehaviourWorkspaceTabs
          value={selectedTab}
          onChange={(next) => {
            selectedTab = next;
            root.render(
              <BehaviourWorkspaceTabs
                value={next}
                onChange={() => undefined}
              />,
            );
          }}
        />,
      ),
    );
    await act(async () =>
      control<HTMLElement>(container, "#behaviour-record-tab").dispatchEvent(
        new dom.window.KeyboardEvent("keydown", {
          key: "ArrowRight",
          bubbles: true,
        }),
      ),
    );
    assert.equal(selectedTab, "trends");
    assert.equal(
      control<HTMLElement>(container, "#behaviour-trends-tab").getAttribute(
        "aria-selected",
      ),
      "true",
    );
    assert.equal(document.activeElement?.id, "behaviour-trends-tab");

    const bounds = historyDateBounds(
      "2026-03-29",
      "2026-03-29",
      "Europe/London",
    );
    assert.deepEqual(bounds, {
      occurredFrom: "2026-03-29T00:00:00.000Z",
      occurredTo: "2026-03-29T22:59:59.999Z",
    });

    const requested: string[] = [];
    globalThis.fetch = async (input) => {
      const url = String(input);
      requested.push(url);
      if (url.includes("/trends?"))
        return Response.json({
          from: "2026-10-01",
          to: "2026-10-12",
          bucket: "daily",
          visibility: "GENERAL",
          totals: {
            totalCount: 1,
            meritCount: 1,
            demeritCount: 0,
            generalCount: 0,
            meritPoints: 1,
            demeritPoints: 0,
            netPoints: 1,
          },
          items: [
            {
              bucketStart: "2026-10-11",
              totalCount: 1,
              meritCount: 1,
              demeritCount: 0,
              generalCount: 0,
              meritPoints: 1,
              demeritPoints: 0,
              netPoints: 1,
            },
          ],
        });
      return Response.json({
        items: [entry],
        nextCursor: url.includes("cursor=") ? null : "next-page",
        canVoid: false,
      });
    };
    await act(async () =>
      root.render(
        <BehaviourRecentWorkspace
          children={[child]}
          categories={[category]}
          canCorrect={false}
          canVoid={false}
          canSensitive={false}
          siteTimeZone="Europe/London"
          refreshKey={0}
          onChanged={() => undefined}
        />,
      ),
    );
    assert.match(requested[0] ?? "", /visibility=GENERAL/);
    assert.match(requested[0] ?? "", /limit=10/);
    assert.equal(
      container.querySelector('#history-visibility option[value="ALL"]'),
      null,
    );
    await click(
      control(
        container,
        'nav[aria-label="Recent behaviour pages"] button:last-child',
      ),
    );
    assert.match(requested.at(-1) ?? "", /cursor=next-page/);
    assert.match(container.textContent ?? "", /Page 2/);
    await change(control(container, "#history-from"), "2026-10-01");
    assert.equal(
      control<HTMLButtonElement>(
        container,
        'nav[aria-label="Recent behaviour pages"] button:first-child',
      ).disabled,
      true,
    );
    assert.equal(requested.at(-1)?.includes("cursor="), false);

    await act(async () =>
      root.render(
        <BehaviourTrends
          active
          canSensitive={false}
          siteTimeZone="Europe/London"
          refreshKey={0}
        />,
      ),
    );
    assert.match(requested.at(-1) ?? "", /\/trends\?/);
    assert.match(container.textContent ?? "", /View accessible data summary/);
    assert.equal(
      container.querySelector('#trend-visibility option[value="ALL"]'),
      null,
    );
  } finally {
    globalThis.fetch = originalFetch;
    await act(async () => root.unmount());
    container.remove();
  }
  process.stdout.write("behaviour-workspace.test.tsx: all assertions passed\n");
}

void run();
