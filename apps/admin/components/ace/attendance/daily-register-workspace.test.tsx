import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { notifyActiveSiteChanged } from "@/lib/active-site-events";
import { setApiClientToken } from "@/lib/api-client";
import type { DailyAttendancePage } from "@/lib/daily-attendance-api";
import { DailyRegisterWorkspace } from "./daily-register-workspace";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/ace/attendance/daily",
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  HTMLInputElement: dom.window.HTMLInputElement,
  HTMLSelectElement: dom.window.HTMLSelectElement,
  HTMLTextAreaElement: dom.window.HTMLTextAreaElement,
  Text: dom.window.Text,
  Event: dom.window.Event,
  requestAnimationFrame: (callback: FrameRequestCallback) =>
    setTimeout(callback, 0),
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  configurable: true,
});
dom.window.HTMLElement.prototype.scrollIntoView = () => undefined;

function response(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function registerPage(
  childId: string,
  mark: DailyAttendancePage["items"][number]["mark"] = null,
  kind = "TEACHING",
): DailyAttendancePage {
  return {
    date: "2026-10-08",
    timezone: "Europe/London",
    teachingDate: { kind, reason: kind === "CLOSED" ? "School holiday" : null },
    permittedBands: [{ id: "band-1", name: "Year 4" }],
    page: 1,
    limit: 50,
    total: 1,
    nextPage: null,
    counts: {
      present: mark?.status === "PRESENT" ? 1 : 0,
      absent: mark?.status === "ABSENT" ? 1 : 0,
      late: mark?.status === "LATE" ? 1 : 0,
      unmarked: mark ? 0 : 1,
    },
    items: [
      {
        childId,
        displayName: childId === "child-a" ? "Ari Student" : "Bea Student",
        academicYear: "2026/27",
        band: { id: "band-1", name: "Year 4" },
        mark,
      },
    ],
  };
}

async function click(container: HTMLElement, label: string) {
  const button = Array.from(container.querySelectorAll("button")).find(
    (item) => item.textContent?.trim() === label,
  );
  assert.ok(button, `expected button ${label}`);
  await act(async () => button.click());
}

async function changeSelect(container: HTMLElement, id: string, value: string) {
  const select = container.querySelector<HTMLSelectElement>(`#${id}`);
  assert.ok(select);
  await act(async () => {
    select.value = value;
    select.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  });
}

async function changeText(container: HTMLElement, id: string, value: string) {
  const input = container.querySelector<HTMLTextAreaElement>(`#${id}`);
  assert.ok(input);
  const setter = Object.getOwnPropertyDescriptor(
    dom.window.HTMLTextAreaElement.prototype,
    "value",
  )?.set;
  assert.ok(setter);
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
}

async function run() {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const originalFetch = globalThis.fetch;
  let site: "a" | "b" = "a";
  let closed = false;
  let denyReads = false;
  let holdNextRead = false;
  let releaseHeldRead: ((value: Response) => void) | null = null;
  let mark: DailyAttendancePage["items"][number]["mark"] = null;
  const writes: Array<Record<string, string>> = [];
  setApiClientToken("test-token");

  globalThis.fetch = async (url, init) => {
    assert.equal(init?.credentials, "include");
    assert.equal(
      (init?.headers as Record<string, string>).Authorization,
      "Bearer test-token",
    );
    const path = new URL(String(url)).pathname;
    if (path === "/attendance/daily") {
      if (holdNextRead && site === "a") {
        holdNextRead = false;
        return new Promise<Response>((resolve) => {
          releaseHeldRead = resolve;
        });
      }
      if (denyReads) return response({ message: "Permission denied" }, 403);
      return response(
        registerPage(
          site === "a" ? "child-a" : "child-b",
          site === "a" ? mark : null,
          closed ? "CLOSED" : "TEACHING",
        ),
      );
    }
    if (path.endsWith("/history")) {
      return response({
        items: [
          {
            previousStatus: "ABSENT",
            newStatus: "LATE",
            previousReason: "SICK",
            newReason: null,
            correctionReason: "Arrived later",
            correctedAt: "2026-10-08T10:00:00.000Z",
            correctedBy: "Tutor",
          },
        ],
        nextCursor: null,
      });
    }
    assert.equal(init?.method, "PUT");
    const body = JSON.parse(String(init.body)) as Record<string, string>;
    writes.push(body);
    mark = {
      id: "fact-a",
      status: body.status as "ABSENT" | "LATE",
      absenceReason: body.absenceReason === "SICK" ? "SICK" : null,
      recordedAt: "2026-10-08T09:00:00.000Z",
      recordedBy: "Tutor",
    };
    return response({ id: "fact-a" });
  };

  try {
    await act(async () =>
      root.render(
        <DailyRegisterWorkspace canManage={false} canExport={false} />,
      ),
    );
    assert.match(container.textContent ?? "", /Ari Student/);
    assert.match(container.textContent ?? "", /Read-only access/);
    assert.equal(container.querySelectorAll("form").length, 0);
    assert.doesNotMatch(container.textContent ?? "", /Download CSV/);

    await act(async () =>
      root.render(<DailyRegisterWorkspace canManage={false} canExport />),
    );
    assert.match(container.textContent ?? "", /Download CSV/);

    await act(async () =>
      root.render(<DailyRegisterWorkspace canManage canExport={false} />),
    );
    const saveButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Save mark",
    );
    assert.ok(saveButton?.disabled);
    await changeSelect(container, "daily-status-child-a", "ABSENT");
    assert.ok(saveButton.disabled, "absence reason is required");
    await changeSelect(container, "daily-reason-child-a", "SICK");
    assert.equal(saveButton.disabled, false);
    await click(container, "Save mark");
    assert.deepEqual(writes[0], { status: "ABSENT", absenceReason: "SICK" });
    assert.match(container.textContent ?? "", /Attendance saved/);

    await changeSelect(container, "daily-status-child-a", "LATE");
    const correctionButton = Array.from(
      container.querySelectorAll("button"),
    ).find((button) => button.textContent?.trim() === "Save correction");
    assert.ok(correctionButton?.disabled, "correction explanation is required");
    await changeText(container, "daily-correction-child-a", "Arrived later");
    assert.equal(correctionButton.disabled, false);
    await click(container, "Save correction");
    assert.deepEqual(writes[1], {
      status: "LATE",
      correctionReason: "Arrived later",
    });
    await click(container, "View corrections for Ari Student");
    assert.match(container.textContent ?? "", /Absent \(Sick\) → Late/);

    closed = true;
    await click(container, "Close history");
    await act(async () => notifyActiveSiteChanged());
    assert.match(container.textContent ?? "", /School holiday/);
    assert.equal(container.querySelectorAll("form").length, 0);

    holdNextRead = true;
    await act(async () => notifyActiveSiteChanged());
    assert.ok(releaseHeldRead, "first site read should be pending");
    site = "b";
    await act(async () => notifyActiveSiteChanged());
    assert.match(container.textContent ?? "", /Bea Student/);
    assert.doesNotMatch(container.textContent ?? "", /Ari Student/);
    await act(async () =>
      releaseHeldRead?.(response(registerPage("child-a", mark))),
    );
    assert.match(
      container.textContent ?? "",
      /Bea Student/,
      "stale first-site response must be discarded",
    );

    denyReads = true;
    await act(async () => notifyActiveSiteChanged());
    assert.match(
      container.textContent ?? "",
      /You cannot access this register/,
    );
    assert.doesNotMatch(container.textContent ?? "", /Bea Student/);
    denyReads = false;
    await click(container, "Retry");
    assert.match(container.textContent ?? "", /Bea Student/);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    globalThis.fetch = originalFetch;
    setApiClientToken(null);
  }
}

void run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
