import { studentDailyAttendanceQuerySchema } from "../dto/student-daily-attendance-query.dto";

describe("student daily attendance range", () => {
  it("accepts a full leap-year range", () => {
    expect(
      studentDailyAttendanceQuerySchema.safeParse({
        from: "2024-01-01",
        to: "2024-12-31",
      }).success,
    ).toBe(true);
  });

  it.each([
    { from: "2024-02-30", to: "2024-03-01" },
    { from: "2024-03-02", to: "2024-03-01" },
    { from: "2023-01-01", to: "2024-01-02" },
    { from: "2024-01-01", to: "2024-01-02", childId: "other-child" },
  ])("rejects invalid or unbounded input %#", (query) => {
    expect(studentDailyAttendanceQuerySchema.safeParse(query).success).toBe(
      false,
    );
  });
});
