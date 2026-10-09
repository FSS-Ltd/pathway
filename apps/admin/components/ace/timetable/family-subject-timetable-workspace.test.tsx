import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { setApiClientToken } from "@/lib/api-client";
import { FamilySubjectTimetableView } from "./family-subject-timetable-workspace";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/ace/family",
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

async function run() {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const requested: string[] = [];
  const originalFetch = globalThis.fetch;
  let denied = false;
  setApiClientToken("subject-family-token");
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    requested.push(url);
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      "Bearer subject-family-token",
    );
    if (denied) return new Response("", { status: 404 });
    return new Response(
      JSON.stringify(
        url.endsWith("/subject-timetable")
          ? {
              siteId: "site-one",
              childId: "child-one",
              childName: "Ari",
              items: [
                {
                  periodId: "period-one",
                  publicationId: "publication-one",
                  periodName: "Autumn",
                  periodStartsOn: "2026-09-01T00:00:00.000Z",
                  periodEndsOn: "2026-12-18T00:00:00.000Z",
                  publishedAt: "2026-10-09T09:00:00.000Z",
                },
              ],
            }
          : {
              siteId: "site-one",
              childId: "child-one",
              childName: "Ari",
              timezone: "Europe/London",
              publicationId: "publication-one",
              periodId: "period-one",
              periodName: "Autumn",
              periodStartsOn: "2026-09-01T00:00:00.000Z",
              periodEndsOn: "2026-12-18T00:00:00.000Z",
              yearBandName: "Year A",
              publishedAt: "2026-10-09T09:00:00.000Z",
              entries: [
                {
                  day: "TUESDAY",
                  slotPosition: 0,
                  slotKind: "LESSON",
                  slotLabel: "Morning",
                  startMinutes: 540,
                  endMinutes: 600,
                  subjectName: "Reading",
                  subjectColor: null,
                },
                {
                  day: "WEDNESDAY",
                  slotPosition: 0,
                  slotKind: "BREAK",
                  slotLabel: "Break",
                  startMinutes: 600,
                  endMinutes: 615,
                  subjectName: null,
                  subjectColor: null,
                },
              ],
            },
      ),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  try {
    await act(async () => {
      root.render(
        <FamilySubjectTimetableView
          scope={{ kind: "parent", siteId: "site-one", childId: "child-one" }}
          status="authenticated"
        />,
      );
    });
    assert.ok(
      requested.some((url) =>
        url.endsWith(
          "/ace/parent/sites/site-one/children/child-one/subject-timetable",
        ),
      ),
    );
    assert.ok(
      requested.some((url) =>
        url.endsWith(
          "/ace/parent/sites/site-one/children/child-one/subject-timetable/period-one",
        ),
      ),
    );
    assert.match(container.textContent ?? "", /Ari’s subject timetable/);
    assert.match(container.textContent ?? "", /Reading/);
    assert.match(container.textContent ?? "", /Published/);
    assert.equal(container.querySelectorAll("button[aria-pressed]").length, 2);
    assert.doesNotMatch(container.textContent ?? "", /publication-one/);

    denied = true;
    await act(async () => {
      root.render(
        <FamilySubjectTimetableView
          scope={{ kind: "student", siteId: "site-two" }}
          status="authenticated"
        />,
      );
    });
    assert.match(
      requested.at(-1) ?? "",
      /\/ace\/student\/sites\/site-two\/subject-timetable$/,
    );
    assert.match(container.textContent ?? "", /not available for this account/);
    assert.doesNotMatch(container.textContent ?? "", /Reading/);

    const requestCount = requested.length;
    await act(async () => {
      root.render(
        <FamilySubjectTimetableView
          scope={{ kind: "student", siteId: "site-two" }}
          status="unauthenticated"
        />,
      );
    });
    assert.equal(requested.length, requestCount);
    assert.match(
      container.textContent ?? "",
      /Sign in to view your subject timetable/,
    );
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = originalFetch;
    setApiClientToken(null);
    container.remove();
  }
}

void run();
