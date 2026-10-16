import assert from "node:assert/strict";
import { log } from "node:console";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { JSDOM } from "jsdom";

process.env.NEXT_PUBLIC_API_URL = "http://api.test";

const dom = new JSDOM(
  '<!doctype html><html><body><button id="trigger">Open billing</button><div id="root"></div></body></html>',
  { url: "http://localhost" },
);
const { window } = dom;
const { document } = window;
Object.defineProperties(globalThis, {
  window: { configurable: true, value: window },
  document: { configurable: true, value: window.document },
  navigator: { configurable: true, value: window.navigator },
  HTMLElement: { configurable: true, value: window.HTMLElement },
  CustomEvent: { configurable: true, value: window.CustomEvent },
  IS_REACT_ACT_ENVIRONMENT: { configurable: true, value: true },
});

const trialList = {
  declaredCapacity: 74,
  trialSlotLimit: 2,
  consumedSlots: 1,
  pendingSelections: 0,
  remainingSlots: 1,
  availableModules: [],
  trials: [
    {
      module: "FINANCE",
      status: "EXPIRED",
      selectedAt: "2026-08-01T00:00:00.000Z",
      activatedAt: "2026-08-01T00:00:00.000Z",
      expiresAt: "2026-09-30T00:00:00.000Z",
      decisionRecorded: false,
    },
  ],
};

globalThis.fetch = async () => ({
  ok: true,
  status: 200,
  json: async () => trialList,
});

const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { DeclaredCapacityTrialNotices } =
  await import("./declared-capacity-trial-notices.tsx");
const root = createRoot(document.getElementById("root"));
const trigger = document.getElementById("trigger");
trigger.focus();

await React.act(async () => {
  root.render(
    React.createElement(DeclaredCapacityTrialNotices, { enabled: true }),
  );
  await delay(0);
});

const dialog = document.querySelector('[role="dialog"]');
assert.ok(dialog, "an undecided expired trial opens the purchase question");
const dismiss = dialog.querySelector('[aria-label="Dismiss trial message"]');
const yes = [...dialog.querySelectorAll("button")].find((button) =>
  button.textContent?.includes("Yes, review prices"),
);
assert.ok(dismiss);
assert.ok(yes);
assert.equal(document.activeElement, yes, "the first decision receives focus");

const tab = new window.KeyboardEvent("keydown", {
  key: "Tab",
  bubbles: true,
  cancelable: true,
});
yes.dispatchEvent(tab);
assert.equal(tab.defaultPrevented, true, "Tab is trapped at the last action");
assert.equal(document.activeElement, dismiss, "Tab wraps to the close action");

const reverseTab = new window.KeyboardEvent("keydown", {
  key: "Tab",
  shiftKey: true,
  bubbles: true,
  cancelable: true,
});
dismiss.dispatchEvent(reverseTab);
assert.equal(reverseTab.defaultPrevented, true);
assert.equal(document.activeElement, yes, "Shift+Tab wraps to the last action");

await React.act(async () => {
  yes.dispatchEvent(
    new window.KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    }),
  );
  await delay(0);
});

assert.equal(document.querySelector('[role="dialog"]'), null);
assert.equal(
  document.activeElement,
  trigger,
  "focus returns to the prior control",
);

await React.act(async () => root.unmount());
window.close();
log("declared-capacity expiry dialog keyboard checks passed");
