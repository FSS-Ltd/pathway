import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { AttendanceRegister } from "./[sessionId]/attendance-register";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost",
});

Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  HTMLInputElement: dom.window.HTMLInputElement,
  HTMLButtonElement: dom.window.HTMLButtonElement,
  Node: dom.window.Node,
  Text: dom.window.Text,
  Event: dom.window.Event,
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  configurable: true,
});

const initialDetail = {
  sessionId: "session-1",
  title: "Morning register",
  date: "2026-08-12T08:30:00.000Z",
  timeRangeLabel: "09:30 - 10:00",
  roomLabel: "Room 1",
  ageGroupLabel: "Year 4",
  rows: [
    {
      attendanceId: "attendance-1",
      childId: "child-1",
      childName: "Jordan Smith",
      status: "absent" as const,
    },
    {
      attendanceId: null,
      childId: "child-2",
      childName: "Alex Morgan",
      status: "unknown" as const,
    },
  ],
  summary: { present: 0, absent: 1, late: 0, unknown: 1 },
  status: "in_progress" as const,
};

const correctedDetail = {
  ...initialDetail,
  rows: [
    { ...initialDetail.rows[0], status: "late" as const },
    initialDetail.rows[1],
  ],
  summary: { present: 0, absent: 0, late: 1, unknown: 1 },
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

async function render(root: Root, node: React.ReactNode): Promise<void> {
  await act(async () => root.render(node));
}

async function click(control: HTMLElement): Promise<void> {
  await act(async () => control.click());
}

async function change(control: HTMLInputElement, value: string): Promise<void> {
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

async function run(): Promise<void> {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);

  try {
    const submissions: unknown[] = [];
    let saveAttempt = 0;
    await render(
      root,
      <AttendanceRegister
        detail={initialDetail}
        onSave={async (rows) => {
          submissions.push(rows);
          saveAttempt += 1;
          if (saveAttempt === 1) throw new Error("Connection interrupted.");
          return correctedDetail;
        }}
      />,
    );

    const late = element<HTMLButtonElement>(
      container,
      "#attendance-child-1-late",
    );
    assert.equal(late.getAttribute("role"), "radio");
    assert.equal(late.getAttribute("aria-label"), "Jordan Smith: Late");
    assert.ok(
      late.className.includes("min-h-11"),
      "status choices retain a 44px minimum target",
    );
    assert.match(late.textContent ?? "", /Late/);
    assert.ok(late.querySelector("svg"), "Late includes a non-colour icon cue");

    await click(
      element<HTMLButtonElement>(container, "#attendance-child-1-absent"),
    );
    assert.equal(
      container.querySelector("#attendance-correction-reason-child-1"),
      null,
      "does not ask for a reason when the saved status is selected again",
    );
    assert.equal(
      element<HTMLButtonElement>(container, "#attendance-save").disabled,
      true,
      "does not submit a no-op status selection",
    );

    await click(late);
    assert.equal(late.getAttribute("aria-checked"), "true");
    assert.match(
      element<HTMLElement>(container, "#attendance-saved-child-1")
        .textContent ?? "",
      /Saved: Absent/,
      "does not replace the authoritative status before the server responds",
    );
    assert.match(container.textContent ?? "", /Pending: Late/);
    assert.match(
      element<HTMLElement>(container, "#attendance-summary-late").textContent ??
        "",
      /0/,
      "does not optimistically change the saved summary",
    );

    const save = element<HTMLButtonElement>(container, "#attendance-save");
    await click(save);
    assert.match(container.textContent ?? "", /Enter a correction reason/);
    assert.equal(submissions.length, 0);

    const reason = element<HTMLInputElement>(
      container,
      "#attendance-correction-reason-child-1",
    );
    assert.equal(reason.required, true);
    await change(reason, "  Arrived after the register closed  ");
    await click(save);
    assert.deepEqual(submissions[0], [
      {
        childId: "child-1",
        status: "LATE",
        correctionReason: "Arrived after the register closed",
      },
    ]);
    assert.match(
      element<HTMLElement>(container, '[role="alert"]').textContent ?? "",
      /No attendance changes were saved/,
    );
    assert.equal(late.getAttribute("aria-checked"), "true");
    assert.equal(reason.value, "  Arrived after the register closed  ");

    await click(element<HTMLButtonElement>(container, "#attendance-retry"));
    assert.deepEqual(submissions[1], submissions[0]);
    assert.match(
      element<HTMLElement>(container, "#attendance-saved-child-1")
        .textContent ?? "",
      /Saved: Late/,
      "shows the returned server state after retry succeeds",
    );
    assert.equal(container.textContent?.includes("Pending: Late"), false);
    assert.match(
      element<HTMLElement>(container, "#attendance-summary-late").textContent ??
        "",
      /1/,
    );

    const initialMarks: unknown[] = [];
    await render(
      root,
      <AttendanceRegister
        key="initial-mark"
        detail={initialDetail}
        onSave={async (rows) => {
          initialMarks.push(rows);
          return {
            ...initialDetail,
            rows: [
              initialDetail.rows[0],
              {
                ...initialDetail.rows[1],
                attendanceId: "attendance-2",
                status: "present" as const,
              },
            ],
            summary: { present: 1, absent: 1, late: 0, unknown: 0 },
          };
        }}
      />,
    );
    await click(
      element<HTMLButtonElement>(container, "#attendance-child-2-present"),
    );
    assert.equal(
      container.querySelector("#attendance-correction-reason-child-2"),
      null,
      "does not ask for a correction reason on an initial mark",
    );
    await click(element<HTMLButtonElement>(container, "#attendance-save"));
    assert.deepEqual(initialMarks[0], [
      { childId: "child-2", status: "PRESENT" },
    ]);
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
}

void run()
  .then(() => console.log("attendance-status.test.tsx: all assertions passed"))
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
