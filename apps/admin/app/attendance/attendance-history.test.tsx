import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act } from "react";

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

const detail = {
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
      attendanceId: "attendance-2",
      childId: "child-2",
      childName: "Alex Morgan",
      status: "present" as const,
    },
    {
      attendanceId: null,
      childId: "child-3",
      childName: "Taylor Fox",
      status: "unknown" as const,
    },
  ],
  summary: { present: 1, absent: 1, late: 0, unknown: 1 },
  status: "in_progress" as const,
};

type PendingRequest = {
  url: string;
  init: RequestInit | undefined;
  resolve: (response: Response) => void;
  reject: (reason: Error) => void;
};

function element<T extends Element>(
  container: HTMLElement,
  selector: string,
): T {
  const found = container.querySelector<T>(selector);
  assert.ok(found, `expected ${selector}`);
  return found;
}

function button(container: HTMLElement, label: string): HTMLButtonElement {
  const found = [...container.querySelectorAll("button")].find((control) =>
    control.textContent?.includes(label),
  );
  assert.ok(found, `expected button ${label}`);
  return found;
}

async function click(control: HTMLElement): Promise<void> {
  await act(async () => control.click());
}

function page(items: unknown[], nextCursor: string | null = null): Response {
  return new Response(JSON.stringify({ items, nextCursor }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

async function run(): Promise<void> {
  const originalFetch = globalThis.fetch;
  const requests: PendingRequest[] = [];
  globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) =>
    new Promise<Response>((resolve, reject) => {
      requests.push({ url: String(input), init, resolve, reject });
    });

  const { createRoot } = await import("react-dom/client");
  const { AttendanceRegister } =
    await import("./[sessionId]/attendance-register");
  const { notifyActiveSiteChanged } =
    await import("../../lib/active-site-events");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);

  try {
    await act(async () =>
      root.render(
        <AttendanceRegister
          canManage={false}
          detail={detail}
          onSave={async () => {
            throw new Error("Read-only staff cannot save");
          }}
        />,
      ),
    );
    assert.equal(container.querySelector('[role="radio"]'), null);
    assert.equal(container.querySelector("#attendance-save"), null);
    assert.equal(container.querySelector("#attendance-history-child-3"), null);

    const firstTrigger = element<HTMLButtonElement>(
      container,
      "#attendance-history-child-1",
    );
    await click(firstTrigger);
    assert.equal(firstTrigger.getAttribute("aria-expanded"), "true");
    element(container, '[aria-label="Loading correction history"]');
    assert.equal(requests.length, 1);
    assert.match(
      requests[0].url,
      /\/attendance\/attendance-1\/history\?limit=25/,
    );
    assert.equal(requests[0].init?.credentials, "include");

    await act(async () =>
      requests[0].resolve(
        page(
          [
            {
              previousStatus: "ABSENT",
              newStatus: "PRESENT",
              reason: "Incorrect mark",
              correctedAt: "2026-08-12T10:00:00.000Z",
              correctedBy: "Casey Morgan",
              recoveredLegacy: false,
            },
          ],
          "next-page",
        ),
      ),
    );
    assert.match(container.textContent ?? "", /Absent → Present/);
    assert.match(container.textContent ?? "", /Incorrect mark/);
    assert.equal(document.activeElement?.id, "attendance-history-heading");

    await click(button(container, "Load more corrections"));
    assert.equal(requests.length, 2);
    assert.match(requests[1].url, /cursor=next-page/);
    await act(async () =>
      requests[1].resolve(
        page([
          {
            previousStatus: null,
            newStatus: "ABSENT",
            reason: "Recovered last correction",
            correctedAt: "2026-08-11T10:00:00.000Z",
            correctedBy: "Alex Lee",
            recoveredLegacy: true,
          },
        ]),
      ),
    );
    assert.match(container.textContent ?? "", /Recovered last correction/);
    assert.match(
      container.textContent ?? "",
      /Previous status unavailable → Absent/,
    );
    assert.equal(
      container.querySelectorAll(
        'ol[aria-label="Corrections for Jordan Smith"] li',
      ).length,
      2,
    );

    await click(button(container, "Close history"));
    assert.equal(document.activeElement, firstTrigger);
    await click(
      element<HTMLButtonElement>(container, "#attendance-history-child-2"),
    );
    assert.equal(requests.length, 3);
    await act(async () => requests[2].reject(new Error("Network unavailable")));
    assert.match(
      container.textContent ?? "",
      /Unable to load correction history/,
    );
    await click(button(container, "Retry"));
    assert.equal(requests.length, 4);
    await act(async () => requests[3].resolve(page([])));
    assert.match(
      container.textContent ?? "",
      /No corrections have been recorded/,
    );

    await click(firstTrigger);
    assert.equal(requests.length, 5);
    await act(async () => notifyActiveSiteChanged());
    assert.equal(requests[4].init?.signal?.aborted, true);
    assert.equal(container.querySelector("#attendance-history-heading"), null);
    await act(async () => requests[4].resolve(page([])));
    assert.equal(container.querySelector("#attendance-history-heading"), null);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    globalThis.fetch = originalFetch;
  }
}

void run()
  .then(() => console.log("attendance-history.test.tsx: all assertions passed"))
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
