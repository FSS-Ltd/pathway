import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { setApiClientToken } from "@/lib/api-client";
import { HeadSubjectTimetableWorkspace } from "./head-subject-timetable-workspace";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/ace/settings/academic/timetable",
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

async function changeValue(
  element: HTMLInputElement | HTMLSelectElement,
  value: string,
) {
  const prototype =
    element instanceof dom.window.HTMLSelectElement
      ? dom.window.HTMLSelectElement.prototype
      : dom.window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  assert.ok(setter);
  await act(async () => {
    setter.call(element, value);
    element.dispatchEvent(
      new dom.window.Event(element.tagName === "SELECT" ? "change" : "input", {
        bubbles: true,
      }),
    );
  });
}

function button(container: HTMLElement, label: string): HTMLButtonElement {
  const result = Array.from(container.querySelectorAll("button")).find(
    (item) => item.textContent?.trim() === label,
  );
  assert.ok(result, `expected ${label} button`);
  return result;
}

async function run() {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const originalFetch = globalThis.fetch;
  const requests: Array<{ method: string; url: string }> = [];
  let version = 0;
  let published = false;
  let entries: Array<{ day: string; slotId: string; subjectId: string }> = [];
  let schedule = {
    id: "schedule-one",
    updatedAt: "2026-10-09T09:00:00.000Z",
    teachingDays: ["TUESDAY"],
    slots: [
      {
        id: "slot-one",
        position: 0,
        kind: "LESSON",
        label: "Morning",
        startMinutes: 540,
        endMinutes: 600,
      },
    ],
  };
  setApiClientToken("head-token");
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    requests.push({ method, url });
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      "Bearer head-token",
    );
    let body: unknown;
    if (url.endsWith("/setup")) {
      body = {
        academicYears: [
          {
            id: "year-one",
            name: "2026/27",
            periods: [
              {
                id: "period-one",
                name: "Autumn",
                startsOn: "2026-09-01",
                endsOn: "2026-12-18",
              },
            ],
          },
        ],
        yearBands: [{ id: "band-one", name: "Year A" }],
      };
    } else if (url.endsWith("/schedule") && method === "PUT") {
      const command = JSON.parse(String(init?.body)) as {
        expectedUpdatedAt: string;
        reason: string;
      };
      assert.equal(command.expectedUpdatedAt, schedule.updatedAt);
      assert.equal(command.reason, "Confirm teaching times");
      schedule = { ...schedule, updatedAt: "2026-10-09T09:30:00.000Z" };
      body = schedule;
    } else if (url.endsWith("/schedule")) {
      body = {
        period: { id: "period-one", name: "Autumn" },
        yearBand: { id: "band-one", name: "Year A" },
        schedule,
      };
    } else if (url.includes("/roster?")) {
      body = {
        items: [
          {
            id: "child-one",
            firstName: "Ari",
            lastName: "Alpha",
            status: published ? "PUBLISHED" : version ? "DRAFT" : "NOT_STARTED",
            draftVersion: version || null,
            publicationId: published ? "publication-one" : null,
            publishedAt: published ? "2026-10-09T10:00:00.000Z" : null,
          },
        ],
        nextCursor: null,
      };
    } else if (url.endsWith("/draft") && method === "PUT") {
      const command = JSON.parse(String(init?.body)) as {
        entries: typeof entries;
        expectedVersion: number;
      };
      assert.equal(command.expectedVersion, 0);
      entries = command.entries;
      version = 1;
      body = { id: "draft-one", version, entries };
    } else if (url.endsWith("/draft")) {
      body = {
        schedule,
        draft: version ? { id: "draft-one", version, entries } : null,
        publications: published
          ? [
              {
                id: "publication-one",
                publishedAt: "2026-10-09T10:00:00.000Z",
                withdrawnAt: null,
              },
            ]
          : [],
        eligibleSubjects: [{ id: "subject-one", name: "Reading", color: null }],
      };
    } else if (url.endsWith("/publish")) {
      const command = JSON.parse(String(init?.body)) as {
        expectedVersion: number;
        acknowledgeUnassigned: boolean;
      };
      assert.equal(command.expectedVersion, 1);
      assert.equal(command.acknowledgeUnassigned, false);
      published = true;
      body = {
        publication: {
          id: "publication-one",
          publishedAt: "2026-10-09T10:00:00.000Z",
        },
        unassignedLessonCount: 0,
      };
    } else {
      throw new Error(`Unexpected request ${method} ${url}`);
    }
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    await act(async () => root.render(<HeadSubjectTimetableWorkspace />));
    assert.match(container.textContent ?? "", /Weekly slot schedule/);
    assert.match(container.textContent ?? "", /Ari Alpha/);
    const scheduleReason =
      container.querySelector<HTMLInputElement>("#schedule-reason");
    assert.ok(scheduleReason);
    await changeValue(scheduleReason, "Confirm teaching times");
    await act(async () => button(container, "Save schedule").click());
    assert.equal(schedule.updatedAt, "2026-10-09T09:30:00.000Z");
    assert.match(
      container.textContent ?? "",
      /Schedule saved for this period and year band/,
    );
    const student = Array.from(container.querySelectorAll("button")).find(
      (item) => item.textContent?.includes("Ari Alpha"),
    );
    assert.ok(student);
    await act(async () => student.click());
    assert.match(container.textContent ?? "", /1 unassigned lesson cell/);
    const subject = container.querySelector<HTMLSelectElement>(
      'select[aria-label="tuesday Morning subject"]',
    );
    assert.ok(subject);
    await changeValue(subject, "subject-one");
    const reason = container.querySelector<HTMLInputElement>(
      "#student-grid-reason",
    );
    assert.ok(reason);
    await changeValue(reason, "Prepare the weekly grid");
    await act(async () => button(container, "Save draft").click());
    assert.equal(version, 1);
    assert.deepEqual(entries, [
      { day: "TUESDAY", slotId: "slot-one", subjectId: "subject-one" },
    ]);
    assert.match(container.textContent ?? "", /Draft version 1/);
    const publishReason = container.querySelector<HTMLInputElement>(
      "#student-grid-reason",
    );
    assert.ok(publishReason);
    await changeValue(publishReason, "Issue the reviewed grid");
    await act(async () => button(container, "Publish to families").click());
    assert.equal(published, true, container.textContent ?? "");
    assert.match(
      container.textContent ?? "",
      /Subject timetable published to linked families/,
    );
    assert.ok(
      requests.some(
        (entry) => entry.url.endsWith("/publish") && entry.method === "POST",
      ),
    );
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = originalFetch;
    setApiClientToken(null);
    container.remove();
  }
}

void run();
