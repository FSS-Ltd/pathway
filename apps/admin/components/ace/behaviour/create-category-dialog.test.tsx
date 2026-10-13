import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import {
  AdminBehaviourApiError,
  type AdminBehaviourPolicyResponse,
} from "@/lib/api-client";
import { CreateCategoryDialog } from "./create-category-dialog";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost",
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  Event: dom.window.Event,
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  configurable: true,
});

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

async function run() {
  const { createRoot } = await import("react-dom/client");
  const container = document.body.appendChild(document.createElement("div"));
  const root = createRoot(container);
  const attempts: Array<{
    name: string;
    type: string;
    visibility: string;
    expectedCategoryVersion: number;
  }> = [];
  const policy: AdminBehaviourPolicyResponse = {
    categoryVersion: 4,
    categories: [],
    demeritPolicy: null,
  };
  let version = 2;
  let created = false;
  let closed = false;
  const render = (canSensitive: boolean) => (
    <CreateCategoryDialog
      categoryVersion={version}
      canSensitive={canSensitive}
      onSave={async (input) => {
        attempts.push(input);
        if (attempts.length === 1) {
          throw new AdminBehaviourApiError("Version conflict", 409);
        }
        return policy;
      }}
      onCreated={(result) => {
        assert.equal(result, policy);
        created = true;
      }}
      onConflict={async () => {
        version = 3;
        root.render(render(canSensitive));
      }}
      onClose={() => {
        closed = true;
      }}
    />
  );
  try {
    await act(async () => root.render(render(false)));
    const name = container.querySelector<HTMLInputElement>("#category-name");
    const type = container.querySelector<HTMLSelectElement>("#category-type");
    const form = container.querySelector<HTMLFormElement>("form");
    assert.ok(name && type && form);
    assert.equal(document.activeElement, name);
    assert.equal(container.querySelector("#category-visibility"), null);
    await change(name, "  Service  ");
    await change(type, "GENERAL");
    await act(async () => {
      form.dispatchEvent(
        new dom.window.Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    assert.match(container.textContent ?? "", /Categories changed/);
    assert.equal(attempts[0]?.visibility, "GENERAL");
    assert.equal(attempts[0]?.expectedCategoryVersion, 2);
    await act(async () => {
      form.dispatchEvent(
        new dom.window.Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    assert.equal(attempts[1]?.expectedCategoryVersion, 3);
    assert.equal(attempts[1]?.name, "Service");
    assert.equal(attempts[1]?.type, "GENERAL");
    assert.equal(created, true);

    await act(async () => root.render(render(true)));
    assert.ok(container.querySelector("#category-visibility"));
    const dialog = container.querySelector<HTMLElement>('[role="dialog"]');
    assert.ok(dialog);
    await act(async () => {
      dialog.dispatchEvent(
        new dom.window.KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
        }),
      );
    });
    assert.equal(closed, true);
  } finally {
    await act(async () => root.unmount());
  }
}

void run().then(
  () => process.stdout.write("create category dialog: passed\n"),
  (error: unknown) => {
    process.stderr.write(String(error));
    process.exitCode = 1;
  },
);
