import assert from "node:assert/strict";
import React, { act } from "react";
import { dom } from "./finance-assurance-test-support";
import { FinanceConfirmDialog } from "./finance-confirm-dialog";

// Model the observed browser default: showModal focuses the first focusable
// preview region, so the safe Cancel action must explicitly take focus after it.
dom.window.HTMLDialogElement.prototype.showModal = function () {
  this.setAttribute("open", "");
  this.querySelector<HTMLElement>('[tabindex="0"]')?.focus();
};
async function run() {
  const { createRoot } = await import("react-dom/client");
  const container = document.body.appendChild(document.createElement("div"));
  const root = createRoot(container);
  let cancellations = 0;
  const render = (busy: boolean, large = false) =>
    root.render(
      <FinanceConfirmDialog
        key={large ? "large" : "compact"}
        title="Issue synthetic invoice?"
        description="Check these charges before issue."
        confirmLabel="Confirm issue"
        busyLabel="Issuing…"
        busy={busy}
        onConfirm={() => {}}
        onCancel={() => {
          cancellations += 1;
        }}
      >
        <div tabIndex={0}>Focusable charge preview</div>
      </FinanceConfirmDialog>,
    );
  try {
    await act(async () => render(false));
    const cancel = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Cancel",
    );
    assert.ok(cancel);
    assert.equal(
      document.activeElement,
      cancel,
      "Cancel receives focus after native modal opening, through the Finance button ref",
    );
    await act(async () => render(true));
    await act(async () =>
      container
        .querySelector("dialog")
        ?.dispatchEvent(new dom.window.Event("cancel", { cancelable: true })),
    );
    assert.equal(
      cancellations,
      0,
      "Escape cannot dismiss a financial action in flight",
    );
    await act(async () => render(false));
    await act(async () =>
      container
        .querySelector("dialog")
        ?.dispatchEvent(new dom.window.Event("cancel", { cancelable: true })),
    );
    assert.equal(
      cancellations,
      1,
      "Escape cancels once when no action is pending",
    );
    Object.defineProperty(
      dom.window.HTMLDialogElement.prototype,
      "scrollHeight",
      { configurable: true, get: () => 800 },
    );
    Object.defineProperty(
      dom.window.HTMLDialogElement.prototype,
      "clientHeight",
      { configurable: true, get: () => 400 },
    );
    await act(async () => render(false, true));
    const title = container.querySelector("h3");
    assert.ok(title);
    assert.equal(
      document.activeElement,
      title,
      "Overflowing review opens at its title so charges can be read before actions",
    );
    assert.equal(container.querySelector("dialog")?.scrollTop, 0);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    dom.window.close();
  }
}
void run();
