import { dailyAttendanceExportQuerySchema } from "../dto/daily-attendance-export-query.dto";

describe("ACE daily attendance export query", () => {
  it("accepts an inclusive 31-day range and optional child", () => {
    expect(
      dailyAttendanceExportQuerySchema.safeParse({
        from: "2042-09-01",
        to: "2042-10-01",
        childId: "c572b198-54c5-461e-850d-cea66b7ad835",
      }).success,
    ).toBe(true);
  });

  it.each([
    { from: "2042-09-02", to: "2042-09-01" },
    { from: "2042-09-01", to: "2042-10-02" },
    { from: "2042-02-30", to: "2042-03-01" },
    { from: "2042-09-01", to: "2042-09-01", childId: "other-site-child" },
  ])("rejects an invalid or unbounded query: %j", (query) => {
    expect(dailyAttendanceExportQuerySchema.safeParse(query).success).toBe(
      false,
    );
  });
});
