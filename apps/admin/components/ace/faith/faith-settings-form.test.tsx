import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { FaithSettingsForm } from "./faith-settings-form";

const dom = new JSDOM("<!doctype html><html><body></body></html>");
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  Event: dom.window.Event,
  IS_REACT_ACT_ENVIRONMENT: true,
});

async function run() {
  const container = document.body.appendChild(document.createElement("div"));
  const root = createRoot(container);
  const saved: Array<{ label: string; enabled: boolean }> = [];
  const onSave = async (label: string, enabled: boolean) => {
    saved.push({ label, enabled });
  };
  try {
    await act(async () => {
      root.render(
        <FaithSettingsForm
          displayLabel="Faith Corner"
          reflectionsEnabled={false}
          reflectionFeatureAvailable={false}
          pending={false}
          onSave={onSave}
        />,
      );
    });
    const disabled = container.querySelector<HTMLInputElement>(
      'input[type="checkbox"]',
    );
    const save = container.querySelector<HTMLButtonElement>(
      'button[type="submit"]',
    );
    assert.ok(disabled);
    assert.ok(save);
    assert.equal(disabled.disabled, true);
    assert.equal(save.disabled, true);
    assert.match(container.textContent ?? "", /not available yet/i);

    await act(async () => {
      root.render(
        <FaithSettingsForm
          displayLabel="Faith Corner"
          reflectionsEnabled={false}
          reflectionFeatureAvailable={true}
          pending={false}
          onSave={onSave}
        />,
      );
    });
    const checkbox = container.querySelector<HTMLInputElement>(
      'input[type="checkbox"]',
    );
    assert.ok(checkbox);
    assert.equal(checkbox.disabled, false);
    await act(async () => checkbox.click());
    assert.equal(checkbox.checked, true);
    assert.equal(save.disabled, false);
    await act(async () => {
      container
        .querySelector("form")
        ?.dispatchEvent(
          new dom.window.Event("submit", { bubbles: true, cancelable: true }),
        );
    });
    assert.deepEqual(saved, [{ label: "Faith Corner", enabled: true }]);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    dom.window.close();
  }
}

void run();
