import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { AcademicCalendarForm } from "./academic-calendar-form";

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

const successfulInput = {
  name: "2026/27",
  startsOn: "2026-09-01",
  endsOn: "2027-07-31",
  reason: "Set the first academic calendar",
  periods: [{ name: "Autumn", startsOn: "2026-09-01", endsOn: "2026-12-18" }],
};

type FormProps = React.ComponentProps<typeof AcademicCalendarForm>;
type Root = {
  render: (node: React.ReactNode) => void;
  unmount: () => void;
};

function createProps(overrides: Partial<FormProps> = {}): FormProps {
  return {
    isLoading: false,
    academicYears: [],
    isSaving: false,
    error: null,
    success: null,
    canManage: true,
    timezone: "Europe/London",
    onSave: async () => undefined,
    ...overrides,
  };
}

function input(container: HTMLElement, id: string): HTMLInputElement {
  const element = container.querySelector<HTMLInputElement>(`#${id}`);
  assert.ok(element, `expected #${id} input`);
  return element;
}

async function changeInput(
  element: HTMLInputElement,
  value: string,
): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(
    dom.window.HTMLInputElement.prototype,
    "value",
  )?.set;
  assert.ok(setter, "input value setter must be available");
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

async function render(root: Root, props: FormProps): Promise<void> {
  await act(async () => {
    root.render(<AcademicCalendarForm {...props} />);
  });
}

async function run(): Promise<void> {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  let root = createRoot(container);

  try {
    await render(root, createProps({ isLoading: true }));
    assert.ok(
      container.querySelector('[aria-label="Loading academic calendar…"]'),
      "renders the loading state",
    );

    await render(root, createProps());
    assert.match(
      container.textContent ?? "",
      /No academic years have been set up\./,
    );

    const form = container.querySelector("form");
    assert.ok(form, "renders a form");
    await submit(form);

    const name = input(container, "academic-year-name");
    const reason = input(container, "academic-year-reason");
    assert.equal(name.getAttribute("aria-invalid"), "true");
    assert.equal(reason.getAttribute("aria-invalid"), "true");
    const reasonDescription = reason.getAttribute("aria-describedby");
    assert.ok(reasonDescription, "reason error is described by a stable ID");
    assert.equal(
      document.getElementById(reasonDescription)?.textContent,
      "Enter a reason for this academic calendar.",
      "validation error is linked to the matching control",
    );
    assert.ok(
      container.querySelector('[role="alert"]'),
      "validation failure is announced to assistive technology",
    );

    await act(async () => root.unmount());
    root = createRoot(container);
    await render(
      root,
      createProps({
        error: "An active academic year already exists for this site.",
      }),
    );
    assert.equal(
      container.querySelector('[role="alert"]')?.textContent,
      "An active academic year already exists for this site.",
      "renders the server conflict",
    );

    await render(root, createProps({ isSaving: true }));
    assert.equal(
      input(container, "academic-year-name").disabled,
      true,
      "disables fields while saving",
    );
    assert.match(container.textContent ?? "", /Saving academic calendar…/);

    await render(root, createProps({ success: "Academic year saved." }));
    assert.match(container.textContent ?? "", /Academic year saved\./);

    await act(async () => root.unmount());
    const keyboardContainer = document.createElement("div");
    document.body.append(keyboardContainer);
    const keyboardRoot = createRoot(keyboardContainer);
    const saves: unknown[] = [];
    await render(
      keyboardRoot,
      createProps({ onSave: async (value) => void saves.push(value) }),
    );

    await changeInput(
      input(keyboardContainer, "academic-year-name"),
      successfulInput.name,
    );
    await changeInput(
      input(keyboardContainer, "academic-year-reason"),
      successfulInput.reason,
    );
    await changeInput(
      input(keyboardContainer, "academic-year-start"),
      successfulInput.startsOn,
    );
    await changeInput(
      input(keyboardContainer, "academic-year-end"),
      successfulInput.endsOn,
    );
    await changeInput(
      input(keyboardContainer, "academic-period-name-0"),
      successfulInput.periods[0].name,
    );
    await changeInput(
      input(keyboardContainer, "academic-period-start-0"),
      successfulInput.periods[0].startsOn,
    );
    const periodEnd = input(keyboardContainer, "academic-period-end-0");
    await changeInput(periodEnd, successfulInput.periods[0].endsOn);

    await act(async () => {
      periodEnd.dispatchEvent(
        new dom.window.KeyboardEvent("keydown", {
          key: "Enter",
          bubbles: true,
        }),
      );
    });
    assert.deepEqual(saves, [successfulInput], "submits valid data with Enter");

    await act(async () => keyboardRoot.unmount());
    keyboardContainer.remove();
  } finally {
    container.remove();
  }
}

void run()
  .then(() =>
    console.log("academic-calendar-form.test.tsx: all assertions passed"),
  )
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
