const groupBy = jest.fn();
const findReports = jest.fn();
const tx = {
  behaviourEntry: { groupBy },
  aceTermReportVersion: { findMany: findReports },
};

jest.mock("@pathway/db", () => ({
  withTenantRlsContext: jest.fn(
    (_siteId: string, _orgId: string, read: (client: typeof tx) => unknown) =>
      read(tx),
  ),
}));

import { readAcademics, readBehaviour } from "../student-overview-sections";
import type { OverviewReadContext } from "../student-overview-sections";

const context: OverviewReadContext = {
  siteId: "site-a",
  orgId: "org-a",
  childId: "child-a",
  timezone: "Europe/London",
  period: {
    from: "2026-09-01",
    to: "2026-10-13",
    label: "2026/27",
    source: "academic-year",
  },
  now: new Date("2026-10-13T12:00:00.000Z"),
};

describe("student overview sections", () => {
  beforeEach(() => jest.clearAllMocks());

  it("filters sensitive, corrected and retracted behaviour before aggregating", async () => {
    groupBy.mockResolvedValue([
      { type: "MERIT", _count: { _all: 2 }, _sum: { pointsDelta: 5 } },
      { type: "DEMERIT", _count: { _all: 1 }, _sum: { pointsDelta: -1 } },
    ]);
    const result = await readBehaviour(context);

    expect(groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: "site-a",
          childId: "child-a",
          visibility: "GENERAL",
          correction: { is: null },
          retraction: { is: null },
        }),
      }),
    );
    expect(result.behaviour).toEqual({
      status: "ready",
      data: { merits: 2, demerits: 1, general: 0 },
    });
    expect(result.merits).toEqual({
      status: "ready",
      data: { count: 2, points: 5 },
    });
  });

  it("reads only guardian-visible reports and emits a safe summary field", async () => {
    findReports.mockResolvedValue([
      {
        reportId: "report-a",
        guardianVisibleAt: new Date("2026-10-01T09:00:00Z"),
        familyPayload: {
          summary: "Progress is steady",
          privateNotes: "hidden",
        },
        report: { academicPeriod: { name: "Autumn" } },
      },
    ]);
    const result = await readAcademics(context);

    expect(findReports).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: "site-a",
          guardianVisibleAt: { lte: context.now },
          report: expect.objectContaining({ childId: "child-a" }),
        }),
      }),
    );
    expect(result).toEqual({
      status: "ready",
      data: {
        reports: [
          {
            periodName: "Autumn",
            publishedAt: "2026-10-01T09:00:00.000Z",
            summary: "Progress is steady",
          },
        ],
      },
    });
  });
});
