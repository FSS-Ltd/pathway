import assert from "node:assert/strict";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { StudentOverviewResponse } from "../../lib/child-overview-api";
import { ChildOverviewPresentation } from "./child-overview-presentation";

const overview: StudentOverviewResponse = {
  identity: {
    id: "child-1",
    firstName: "Alex",
    lastName: "Taylor",
    preferredName: null,
    yearGroup: "Year 7",
    groupName: "Oak",
    status: "enrolled",
  },
  period: {
    from: "2026-09-01",
    to: "2026-10-13",
    label: "2026–27 academic year",
    source: "academic-year",
  },
  tabs: ["overview", "attendance", "contacts", "registration"],
  actions: [],
  sections: {
    attendance: {
      status: "ready",
      data: {
        total: 20,
        present: 18,
        absent: 1,
        late: 1,
        attendanceRate: 90,
      },
    },
    academics: { status: "unavailable", reason: "No released reports" },
    pace: {
      status: "ready",
      data: {
        subjects: [
          {
            subjectId: "subject-1",
            subjectName: "Mathematics",
            currentPace: 5,
            targetPace: 7,
            completedPaces: 4,
            trackStatus: "ON_TRACK",
          },
        ],
      },
    },
    behaviour: {
      status: "ready",
      data: { merits: 3, demerits: 1, general: 0 },
    },
    discipline: { status: "empty" },
    merits: { status: "ready", data: { count: 3, points: 7 } },
  },
};

const render = (
  value: StudentOverviewResponse,
  activeTab: StudentOverviewResponse["tabs"][number],
) =>
  renderToStaticMarkup(
    <ChildOverviewPresentation
      overview={value}
      activeTab={activeTab}
      onSelectTab={() => undefined}
      onRetry={() => undefined}
    />,
  );

const generalOverview = render(overview, "overview");
assert.match(generalOverview, /2026–27 academic year/);
assert.match(generalOverview, /90% attendance/);
assert.match(generalOverview, /View attendance/);
assert.doesNotMatch(generalOverview, /Subjects &amp; PACEs/);
assert.doesNotMatch(generalOverview, /Behaviour/);
assert.doesNotMatch(generalOverview, /Merits activity/);
assert.equal(render(overview, "pace"), "");

const aceOverview: StudentOverviewResponse = {
  ...overview,
  tabs: [
    ...overview.tabs,
    "academics",
    "pace",
    "behaviour",
    "discipline",
    "merits",
  ],
  sections: {
    ...overview.sections,
    academics: { status: "empty" },
    behaviour: { status: "error" },
  },
};
const aceCards = render(aceOverview, "overview");
assert.match(aceCards, /Subjects &amp; PACEs/);
assert.match(aceCards, /No records for this period/);
assert.match(aceCards, /This section could not be loaded/);
assert.match(aceCards, /Try again/);
assert.match(render(aceOverview, "pace"), /Current PACE 5/);
assert.match(render(aceOverview, "attendance"), /Attendance rate/);
assert.match(render(aceOverview, "behaviour"), /role="alert"/);
