import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import type {
  AdminBehaviourCategory,
  AdminBehaviourCommandInput,
  AdminBehaviourEntry,
} from "@/lib/api-client";
import { BehaviourForm } from "./behaviour-form";
import { BehaviourHistory } from "./behaviour-history";
import { isValidIanaTimeZone, siteDateTimeToIso } from "./behaviour-time";

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
  Text: dom.window.Text,
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
const categories: AdminBehaviourCategory[] = [
  {
    code: "kindness",
    label: "Kindness",
    type: "MERIT",
    visibility: "GENERAL",
    isActive: true,
    isSerious: false,
    sortOrder: 1,
  },
  {
    code: "conduct",
    label: "Conduct",
    type: "DEMERIT",
    visibility: "GENERAL",
    isActive: true,
    isSerious: false,
    sortOrder: 2,
  },
  {
    code: "pastoral",
    label: "Pastoral care",
    type: "GENERAL",
    visibility: "SENSITIVE",
    isActive: true,
    isSerious: false,
    sortOrder: 3,
  },
  {
    code: "retired",
    label: "Retired category",
    type: "GENERAL",
    visibility: "GENERAL",
    isActive: false,
    isSerious: false,
    sortOrder: 4,
  },
];

const entry: AdminBehaviourEntry = {
  id: "22222222-2222-4222-8222-222222222222",
  childId: child.id,
  category: "conduct",
  categoryPolicyVersion: 2,
  categoryIsSerious: false,
  type: "DEMERIT",
  visibility: "GENERAL",
  pointsDelta: -2,
  occurredAt: "2026-08-12T09:30:00.000Z",
  recordedByUserId: "33333333-3333-4333-8333-333333333333",
  reason: "Disrupted the lesson",
  note: null,
  correctsBehaviourEntryId: null,
  createdAt: "2026-08-12T09:31:00.000Z",
};

type Root = { render: (node: React.ReactNode) => void; unmount: () => void };

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
): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(control),
    "value",
  )?.set;
  assert.ok(setter, "control value setter is available");
  await act(async () => {
    setter.call(control, value);
    control.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    control.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  });
}

async function click(control: HTMLElement): Promise<void> {
  await act(async () => control.click());
}

async function submit(form: HTMLFormElement): Promise<void> {
  await act(async () => {
    form.dispatchEvent(
      new dom.window.Event("submit", { bubbles: true, cancelable: true }),
    );
  });
}

async function render(root: Root, node: React.ReactNode): Promise<void> {
  await act(async () => root.render(node));
}

async function run(): Promise<void> {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);

  try {
    await render(
      root,
      <BehaviourForm
        children={[child]}
        categories={categories}
        canSensitive={false}
        siteTimeZone="America/Los_Angeles"
        onSave={async () => ({ entry, duplicate: false })}
      />,
    );
    assert.equal(
      container.textContent?.includes("Pastoral care"),
      false,
      "does not reveal a sensitive category without permission",
    );
    assert.equal(
      container.textContent?.includes("Sensitive records"),
      false,
      "does not reveal sensitive mode without permission",
    );
    assert.equal(
      container.textContent?.includes("Retired category"),
      false,
      "does not offer an inactive category",
    );
    assert.ok(
      container.querySelector(
        '[role="radiogroup"][aria-label="Behaviour categories"]',
      ),
      "exposes category selection as an accessible radio group",
    );

    await change(
      element<HTMLSelectElement>(container, "#behaviour-type-filter"),
      "DEMERIT",
    );
    assert.match(container.textContent ?? "", /Conduct/);
    assert.equal(
      container.textContent?.includes("Kindness"),
      false,
      "filters category choices by type",
    );

    await render(
      root,
      <BehaviourForm
        children={[child]}
        categories={categories}
        canSensitive
        siteTimeZone="America/Los_Angeles"
        initialDraft={{
          childId: child.id,
          category: "pastoral",
          pointsDelta: "0",
          occurredAt: "2026-08-12T09:30",
          reason: "Private pastoral follow-up",
          note: "Restricted detail",
        }}
        onSave={async () => ({ entry, duplicate: false })}
      />,
    );
    await click(
      element<HTMLInputElement>(container, "#behaviour-visibility-sensitive"),
    );
    assert.match(
      container.querySelector('[role="alert"]')?.textContent ?? "",
      /restricted behaviour record/i,
      "warns before an authorised operator uses sensitive mode",
    );
    assert.match(container.textContent ?? "", /Pastoral care/);

    await render(
      root,
      <BehaviourForm
        children={[child]}
        categories={categories}
        canSensitive={false}
        siteTimeZone="America/Los_Angeles"
        initialDraft={{
          childId: child.id,
          category: "pastoral",
          pointsDelta: "0",
          occurredAt: "2026-08-12T09:30",
          reason: "Stale cached sensitive draft",
          note: "Must not remain selectable",
        }}
        onSave={async () => ({ entry, duplicate: false })}
      />,
    );
    assert.equal(
      element<HTMLSelectElement>(container, "#behaviour-child").value,
      child.id,
      "preserves non-sensitive draft fields",
    );
    assert.equal(
      container.querySelector<HTMLInputElement>(
        'input[name="behaviour-category"]:checked',
      ),
      null,
      "drops a stale sensitive category selection when permission is absent",
    );
    assert.equal(
      element<HTMLInputElement>(container, "#behaviour-reason").value,
      "",
      "clears stale sensitive narrative before rendering",
    );
    assert.equal(
      element<HTMLTextAreaElement>(container, "#behaviour-note").value,
      "",
      "clears stale sensitive notes before rendering",
    );

    const commands: AdminBehaviourCommandInput[] = [];
    let attempt = 0;
    await render(
      root,
      <BehaviourForm
        children={[child]}
        categories={categories}
        canSensitive={false}
        siteTimeZone="America/Los_Angeles"
        onSave={async (command) => {
          commands.push(command);
          attempt += 1;
          if (attempt <= 2)
            throw new Error("Connection interrupted. Try again.");
          return { entry, duplicate: false };
        }}
      />,
    );
    await change(
      element<HTMLSelectElement>(container, "#behaviour-child"),
      child.id,
    );
    await click(
      element<HTMLInputElement>(container, "#behaviour-category-kindness"),
    );
    await change(
      element<HTMLInputElement>(container, "#behaviour-points"),
      "2",
    );
    await change(
      element<HTMLInputElement>(container, "#behaviour-reason"),
      "Helped another learner",
    );
    const captureForm = element<HTMLFormElement>(
      container,
      'form[aria-label="Record behaviour"]',
    );
    await submit(captureForm);
    assert.match(container.textContent ?? "", /Connection interrupted/);
    assert.equal(
      element<HTMLInputElement>(container, "#behaviour-reason").value,
      "Helped another learner",
      "preserves the draft after a recoverable command failure",
    );
    await submit(captureForm);
    assert.equal(commands.length, 2);
    assert.equal(
      commands[0]?.idempotencyKey,
      commands[1]?.idempotencyKey,
      "reuses the command key while retrying the same draft",
    );
    assert.match(container.textContent ?? "", /Connection interrupted/);
    await change(
      element<HTMLInputElement>(container, "#behaviour-reason"),
      "Helped two learners",
    );
    await submit(captureForm);
    assert.equal(commands.length, 3);
    assert.notEqual(
      commands[1]?.idempotencyKey,
      commands[2]?.idempotencyKey,
      "rotates the command key after a failed payload is edited",
    );
    assert.equal(commands[2]?.reason, "Helped two learners");
    const success = container.querySelector<HTMLElement>('[role="status"]');
    assert.match(success?.textContent ?? "", /Behaviour recorded\./);
    assert.equal(document.activeElement, success, "focuses the success result");

    let retried = 0;
    await render(
      root,
      <BehaviourHistory
        isLoading
        error={null}
        items={[]}
        children={[child]}
        canCorrect={false}
        canSensitive={false}
        siteTimeZone="America/Los_Angeles"
        onRetry={() => {
          retried += 1;
        }}
        onCorrect={async () => ({ entry, duplicate: false })}
      />,
    );
    assert.ok(
      container.querySelector('[aria-label="Loading behaviour history…"]'),
    );

    await render(
      root,
      <BehaviourHistory
        isLoading={false}
        error="History is temporarily unavailable."
        items={[]}
        children={[child]}
        canCorrect={false}
        canSensitive={false}
        siteTimeZone="America/Los_Angeles"
        onRetry={() => {
          retried += 1;
        }}
        onCorrect={async () => ({ entry, duplicate: false })}
      />,
    );
    await click(
      element<HTMLButtonElement>(container, "#behaviour-history-retry"),
    );
    assert.equal(retried, 1, "offers history retry after an error");

    await render(
      root,
      <BehaviourHistory
        isLoading={false}
        error={null}
        items={[]}
        children={[child]}
        canCorrect={false}
        canSensitive={false}
        siteTimeZone="America/Los_Angeles"
        onRetry={() => undefined}
        onCorrect={async () => ({ entry, duplicate: false })}
      />,
    );
    assert.match(container.textContent ?? "", /No behaviour records yet\./);

    const corrections: Array<{
      entryId: string;
      input: AdminBehaviourCommandInput;
    }> = [];
    let correctionAttempt = 0;
    await render(
      root,
      <BehaviourHistory
        isLoading={false}
        error={null}
        items={[entry]}
        children={[child]}
        canCorrect
        canSensitive={false}
        siteTimeZone="America/Los_Angeles"
        onRetry={() => undefined}
        onCorrect={async (entryId, input) => {
          corrections.push({ entryId, input });
          correctionAttempt += 1;
          if (correctionAttempt === 1) {
            throw new Error("Correction temporarily unavailable.");
          }
          return {
            entry: { ...entry, reason: input.reason },
            duplicate: false,
          };
        }}
      />,
    );
    await click(
      element<HTMLButtonElement>(container, `#behaviour-correct-${entry.id}`),
    );
    const correctionForm = element<HTMLFormElement>(
      container,
      'form[aria-label="Correct behaviour record"]',
    );
    await submit(correctionForm);
    const reason = element<HTMLInputElement>(
      container,
      `#behaviour-correction-reason-${entry.id}`,
    );
    assert.equal(reason.getAttribute("aria-invalid"), "true");
    await change(reason, "Correct the recorded context");
    await submit(correctionForm);
    assert.match(
      container.textContent ?? "",
      /Correction temporarily unavailable/,
    );
    await change(reason, "Correct the recorded context and outcome");
    await submit(correctionForm);
    assert.equal(corrections.length, 2);
    assert.equal(corrections[0]?.entryId, entry.id);
    assert.equal(corrections[0]?.input.reason, "Correct the recorded context");
    assert.equal(
      corrections[1]?.input.reason,
      "Correct the recorded context and outcome",
    );
    assert.notEqual(
      corrections[0]?.input.idempotencyKey,
      corrections[1]?.input.idempotencyKey,
      "rotates correction idempotency after a failed payload is edited",
    );
    const correctionSuccess = element<HTMLElement>(
      container,
      '[role="status"]',
    );
    assert.match(correctionSuccess.textContent ?? "", /Correction recorded/);
    assert.equal(
      document.activeElement,
      correctionSuccess,
      "focuses correction success feedback",
    );

    const zonedCommands: AdminBehaviourCommandInput[] = [];
    await render(
      root,
      <BehaviourForm
        children={[child]}
        categories={categories}
        canSensitive={false}
        siteTimeZone="America/Los_Angeles"
        initialDraft={{
          childId: child.id,
          category: "kindness",
          pointsDelta: "2",
          occurredAt: "2026-06-01T00:30:00.000Z",
          reason: "Site-local capture",
          note: "",
        }}
        onSave={async (input) => {
          zonedCommands.push(input);
          return { entry, duplicate: false };
        }}
      />,
    );
    const occurredAt = element<HTMLInputElement>(
      container,
      "#behaviour-occurred-at",
    );
    assert.equal(
      occurredAt.value,
      "2026-05-31T17:30",
      "constructs the input in the active site's IANA timezone",
    );
    await change(occurredAt, "2026-05-31T18:45");
    await submit(
      element<HTMLFormElement>(
        container,
        'form[aria-label="Record behaviour"]',
      ),
    );
    assert.equal(
      zonedCommands[0]?.occurredAt,
      "2026-06-01T01:45:00.000Z",
      "submits the site-local input as the matching UTC instant",
    );

    await render(
      root,
      <BehaviourHistory
        isLoading={false}
        error={null}
        items={[{ ...entry, occurredAt: "2026-06-01T00:30:00.000Z" }]}
        children={[child]}
        canCorrect={false}
        canSensitive={false}
        siteTimeZone="America/Los_Angeles"
        onRetry={() => undefined}
        onCorrect={async () => ({ entry, duplicate: false })}
      />,
    );
    assert.match(
      container.textContent ?? "",
      /31 May 2026.*17:30/,
      "renders history in the active site's IANA timezone",
    );
    assert.equal(
      siteDateTimeToIso("2026-03-08T02:30", "America/Los_Angeles"),
      null,
      "rejects a site-local time skipped by the daylight-saving transition",
    );
    assert.equal(
      siteDateTimeToIso("2026-11-01T01:30", "America/Los_Angeles"),
      "2026-11-01T08:30:00.000Z",
      "uses the earlier instant when a site-local time repeats",
    );
    assert.equal(
      isValidIanaTimeZone("not/a-timezone"),
      false,
      "rejects an invalid active-site timezone",
    );
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
}

void run()
  .then(() => console.log("behaviour-workflow.test.tsx: all assertions passed"))
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
