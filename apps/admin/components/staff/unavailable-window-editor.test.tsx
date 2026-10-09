import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { toLocalDateKey } from "@/lib/date";
import type { StaffUnavailableWindow } from "@/lib/api-client";
import { UnavailableWindowEditor } from "./unavailable-window-editor";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/staff/profile",
});
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

async function changeInput(
  element: HTMLInputElement,
  value: string,
): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(
    dom.window.HTMLInputElement.prototype,
    "value",
  )?.set;
  assert.ok(setter);
  await act(async () => {
    setter.call(element, value);
    element.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
}

async function run(): Promise<void> {
  const { createRoot } = await import("react-dom/client");
  const container = document.body.appendChild(document.createElement("div"));
  const root = createRoot(container);
  const month = toLocalDateKey(new Date()).slice(0, 7);
  const windows: StaffUnavailableWindow[] = [
    { date: `${month}-01`, startMinute: 0, endMinute: 1440 },
    { date: `${month}-02`, startMinute: 600, endMinute: 660 },
    { date: "2030-01-03", startMinute: 0, endMinute: 1440 },
  ];
  let changed: StaffUnavailableWindow[] | null = null;

  try {
    await act(async () => {
      root.render(
        <UnavailableWindowEditor
          value={windows}
          onChange={(next) => {
            changed = next;
          }}
        />,
      );
    });
    assert.match(
      container.textContent ?? "",
      new RegExp(`${month}-01 · All day`),
    );
    assert.match(
      container.textContent ?? "",
      new RegExp(`${month}-02 · 10:00–11:00`),
    );
    assert.doesNotMatch(container.textContent ?? "", /2030-01-03/);
    assert.ok(container.querySelector('input#unavailable-date[type="date"]'));
    assert.ok(container.querySelector('label[for="unavailable-date"]'));

    await act(async () => {
      container.querySelector<HTMLButtonElement>("button")?.click();
    });
    assert.match(
      container.querySelector('[role="alert"]')?.textContent ?? "",
      /Choose a date/,
    );

    const dateInput =
      container.querySelector<HTMLInputElement>("#unavailable-date");
    assert.ok(dateInput);
    await changeInput(dateInput, `${month}-03`);
    await act(async () => {
      container
        .querySelector<HTMLInputElement>('input[type="checkbox"]')
        ?.click();
    });
    const endInput =
      container.querySelector<HTMLInputElement>("#unavailable-end");
    assert.ok(endInput);
    await changeInput(endInput, "10:00");
    await act(async () => {
      container.querySelector<HTMLButtonElement>("button")?.click();
    });
    assert.deepEqual(changed, [
      ...windows,
      { date: `${month}-03`, startMinute: 540, endMinute: 600 },
    ]);

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(
          `button[aria-label="Remove unavailable time on ${month}-02 from 10:00 to 11:00"]`,
        )
        ?.click();
    });
    assert.deepEqual(changed, [windows[0], windows[2]]);

    await act(async () => {
      root.render(
        <UnavailableWindowEditor
          value={[]}
          onChange={() => undefined}
          disabled
        />,
      );
    });
    assert.match(
      container.textContent ?? "",
      /No unavailable time recorded for this month/,
    );
    assert.equal(
      container.querySelector<HTMLButtonElement>("button")?.disabled,
      true,
    );
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
}

void run();
