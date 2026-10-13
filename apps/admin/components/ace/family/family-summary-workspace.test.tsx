import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { setApiClientToken } from "@/lib/api-client";
import type { StudentOverviewResponse } from "@/lib/child-overview-api";
import { FamilySummaryView } from "./family-summary-workspace";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/ace/parent/sites/site-one/children/child-one/summary",
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

const overview: StudentOverviewResponse = {
  identity: {
    id: "child-one",
    firstName: "Ari",
    lastName: "Alpha",
    preferredName: null,
    yearGroup: "Year 5",
    groupName: "Oak",
    status: "enrolled",
  },
  period: {
    from: "2026-09-01",
    to: "2026-10-11",
    label: "Current academic year",
    source: "academic-year",
  },
  tabs: ["overview", "attendance", "pace", "behaviour"],
  actions: [],
  sections: {
    attendance: {
      status: "ready",
      data: {
        total: 10,
        present: 8,
        absent: 1,
        late: 1,
        attendanceRate: 80,
      },
    },
    academics: { status: "unavailable", reason: "Not published" },
    pace: {
      status: "ready",
      data: {
        subjects: [
          {
            subjectId: "subject-one",
            subjectName: "Maths",
            currentPace: 3,
            targetPace: 4,
            completedPaces: 2,
            trackStatus: null,
          },
        ],
      },
    },
    behaviour: { status: "error" },
    discipline: { status: "unavailable", reason: "Not released" },
    merits: { status: "empty" },
  },
};

const genericOverview: StudentOverviewResponse = {
  ...overview,
  period: {
    from: "2026-09-12",
    to: "2026-10-11",
    label: "Last 30 days",
    source: "last-30-days",
  },
  tabs: ["overview", "attendance"],
};

const aceServices = {
  siteId: "site-one",
  childId: "child-one",
  childName: "Ari Alpha",
  asOf: "2026-10-11T12:00:00.000Z",
  sections: {
    attendance: { status: "unavailable" },
    notices: {
      status: "error",
      message: "This section could not be loaded.",
    },
    messages: { status: "ready", data: { unreadCount: 2 } },
    homework: { status: "unavailable" },
    reports: { status: "unavailable" },
    slips: { status: "unavailable" },
    faith: { status: "unavailable" },
    finance: { status: "unavailable" },
  },
};

async function run() {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const originalFetch = globalThis.fetch;
  const requested: string[] = [];
  let denied = false;
  let generic = false;
  let servicesFailed = false;
  let overviewFailed = false;
  setApiClientToken("family-token");
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    requested.push(url);
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      "Bearer family-token",
    );
    if (denied) return new Response("", { status: 404 });
    if (servicesFailed && url.endsWith("/summary")) {
      return new Response("", { status: 500 });
    }
    if (overviewFailed && url.endsWith("/overview")) {
      return new Response("", { status: 500 });
    }
    return new Response(
      JSON.stringify(
        url.endsWith("/overview")
          ? generic
            ? genericOverview
            : overview
          : aceServices,
      ),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  try {
    await act(async () => {
      root.render(
        <FamilySummaryView
          siteId="site-one"
          childId="child-one"
          status="authenticated"
        />,
      );
    });
    assert.deepEqual(requested.sort(), [
      "http://api.test/ace/family/sites/site-one/children/child-one/summary",
      "http://api.test/family/sites/site-one/children/child-one/overview",
    ]);
    assert.match(container.textContent ?? "", /Ari Alpha’s overview/);
    assert.match(container.textContent ?? "", /80% attendance/);
    assert.match(container.textContent ?? "", /Current academic year/);
    assert.match(container.textContent ?? "", /2 unread messages/);
    assert.match(
      container.textContent ?? "",
      /This section could not be loaded/,
    );
    assert.doesNotMatch(
      container.textContent ?? "",
      /Finance|Notes|Registration/,
    );
    const attendanceTab = Array.from(
      container.querySelectorAll('[role="group"] button'),
    ).find((button) => button.textContent?.trim() === "Attendance");
    assert.ok(attendanceTab);
    await act(async () => attendanceTab.click());
    assert.equal(
      container.querySelector('a[href$="/attendance"]')?.getAttribute("href"),
      "/ace/parent/sites/site-one/children/child-one/attendance",
    );

    servicesFailed = true;
    await act(async () => {
      root.render(
        <FamilySummaryView
          key="services-failed"
          siteId="site-one"
          childId="child-one"
          status="authenticated"
        />,
      );
    });
    assert.match(container.textContent ?? "", /Ari Alpha’s overview/);
    assert.match(container.textContent ?? "", /School updates/);
    assert.match(
      container.textContent ?? "",
      /Family summary could not be loaded/,
    );

    servicesFailed = false;
    overviewFailed = true;
    await act(async () => {
      root.render(
        <FamilySummaryView
          key="overview-failed"
          siteId="site-one"
          childId="child-one"
          status="authenticated"
        />,
      );
    });
    assert.match(
      container.textContent ?? "",
      /Family overview could not be loaded/,
    );
    assert.match(container.textContent ?? "", /2 unread messages/);

    requested.length = 0;
    generic = true;
    overviewFailed = false;
    await act(async () => {
      root.render(
        <FamilySummaryView
          key="generic"
          siteId="site-one"
          childId="child-one"
          status="authenticated"
          includeAceServices={false}
        />,
      );
    });
    assert.deepEqual(requested, [
      "http://api.test/family/sites/site-one/children/child-one/overview",
    ]);
    assert.doesNotMatch(container.textContent ?? "", /School updates|messages/);
    assert.doesNotMatch(container.textContent ?? "", /PACE|Behaviour/);
    assert.match(container.textContent ?? "", /Last 30 days/);
    assert.equal(container.querySelector('a[href$="/attendance"]'), null);

    denied = true;
    await act(async () => {
      root.render(
        <FamilySummaryView
          key="denied"
          siteId="site-one"
          childId="child-one"
          status="authenticated"
          includeAceServices={false}
        />,
      );
    });
    assert.match(container.textContent ?? "", /no longer available/);
    assert.doesNotMatch(container.textContent ?? "", /Ari Alpha/);
    const requestCount = requested.length;
    await act(async () => {
      root.render(
        <FamilySummaryView
          key="signed-out"
          siteId="site-one"
          childId="child-one"
          status="unauthenticated"
        />,
      );
    });
    assert.equal(requested.length, requestCount);
    assert.match(container.textContent ?? "", /Sign in to continue/);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = originalFetch;
    setApiClientToken(null);
    container.remove();
  }
}

void run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
