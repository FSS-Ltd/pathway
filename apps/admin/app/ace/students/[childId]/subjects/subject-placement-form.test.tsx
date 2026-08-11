import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { SubjectPlacementForm } from "./subject-placement-form";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost",
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
  KeyboardEvent: dom.window.KeyboardEvent,
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  configurable: true,
});

type Props = React.ComponentProps<typeof SubjectPlacementForm>;
type Root = { render: (node: React.ReactNode) => void; unmount: () => void };

function props(overrides: Partial<Props> = {}): Props {
  return {
    isLoading: false,
    placements: [],
    subjects: [{ id: "subject-1", name: "Mathematics" }],
    isSaving: false,
    error: null,
    success: null,
    canRecord: true,
    onSave: async () => undefined,
    ...overrides,
  };
}

function input(container: HTMLElement, id: string): HTMLInputElement {
  const element = container.querySelector<HTMLInputElement>(`#${id}`);
  assert.ok(element, `expected #${id}`);
  return element;
}

async function change(element: HTMLInputElement, value: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(
    dom.window.HTMLInputElement.prototype,
    "value",
  )?.set;
  assert.ok(setter, "input value setter is available");
  await act(async () => {
    setter.call(element, value);
    element.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
}

async function submit(form: HTMLFormElement): Promise<void> {
  await act(async () => {
    form.dispatchEvent(
      new dom.window.Event("submit", { bubbles: true, cancelable: true }),
    );
  });
}

async function render(root: Root, value: Props): Promise<void> {
  await act(async () => {
    root.render(<SubjectPlacementForm {...value} />);
  });
}

async function run(): Promise<void> {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  let root = createRoot(container);
  try {
    await render(root, props({ isLoading: true }));
    assert.ok(
      container.querySelector('[aria-label="Loading subject placements…"]'),
      "renders loading",
    );
    await render(root, props());
    assert.match(
      container.textContent ?? "",
      /No active subject placements\./,
      "renders empty",
    );
    const form = container.querySelector("form");
    assert.ok(form, "renders form");
    await submit(form);
    const reason = input(container, "subject-placement-reason");
    assert.equal(reason.getAttribute("aria-invalid"), "true");
    const description = reason.getAttribute("aria-describedby");
    assert.equal(
      document.getElementById(description ?? "")?.textContent,
      "Enter a reason for this placement.",
    );
    assert.ok(
      container.querySelector('[role="alert"]'),
      "announces validation",
    );
    await render(
      root,
      props({
        error: "This student already has an active Mathematics placement.",
      }),
    );
    assert.equal(
      container.querySelector('[role="alert"]')?.textContent,
      "This student already has an active Mathematics placement.",
    );
    await render(root, props({ isSaving: true }));
    assert.equal(
      input(container, "subject-placement-starting-pace").disabled,
      true,
    );
    await render(root, props({ success: "Subject placement saved." }));
    assert.match(container.textContent ?? "", /Subject placement saved\./);

    await act(async () => root.unmount());
    const keyboardContainer = document.createElement("div");
    document.body.append(keyboardContainer);
    const keyboardRoot = createRoot(keyboardContainer);
    const saves: unknown[] = [];
    await render(
      keyboardRoot,
      props({ onSave: async (value) => void saves.push(value) }),
    );
    await change(
      input(keyboardContainer, "subject-placement-starts-on"),
      "2026-09-01",
    );
    await change(
      input(keyboardContainer, "subject-placement-starting-pace"),
      "1",
    );
    await change(
      input(keyboardContainer, "subject-placement-current-pace"),
      "2",
    );
    const target = input(keyboardContainer, "subject-placement-target-pace");
    await change(target, "12");
    await change(
      input(keyboardContainer, "subject-placement-reason"),
      "Initial placement",
    );
    await act(async () => {
      target.dispatchEvent(
        new dom.window.KeyboardEvent("keydown", {
          key: "Enter",
          bubbles: true,
        }),
      );
    });
    assert.deepEqual(
      saves,
      [
        {
          subjectId: "subject-1",
          startsOn: "2026-09-01",
          startingPace: 1,
          currentPace: 2,
          targetPace: 12,
          reason: "Initial placement",
        },
      ],
      "submits explicit PACE values with Enter",
    );
    await act(async () => keyboardRoot.unmount());
    keyboardContainer.remove();
  } finally {
    container.remove();
  }
}

void run()
  .then(() =>
    console.log("subject-placement-form.test.tsx: all assertions passed"),
  )
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
