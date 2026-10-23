import { planReconciliationWindow } from "../finance-reconciliation-window";

const now = new Date("2026-10-23T12:00:00.900Z");
const empty = { active: null, completedThrough: null };

describe("Finance reconciliation coverage window", () => {
  it("starts with an explicit seven-day window and a whole-second cutoff", () => {
    expect(planReconciliationWindow(empty, "events", now)).toEqual({
      from: new Date("2026-10-16T12:00:00Z"),
      to: new Date("2026-10-23T12:00:00Z"),
      cursor: null,
      gap: null,
    });
  });

  it("overlaps the last completed cutoff by seven days", () => {
    expect(
      planReconciliationWindow(
        { active: null, completedThrough: new Date("2026-10-22T12:00:00Z") },
        "refunds",
        now,
      )?.from,
    ).toEqual(new Date("2026-10-15T12:00:00Z"));
  });

  it("resumes an interrupted page with its original fixed window", () => {
    const active = {
      from: new Date("2026-10-15T12:00:00Z"),
      to: new Date("2026-10-22T12:00:00Z"),
      cursor: "evt_page_one",
    };
    expect(
      planReconciliationWindow(
        { active, completedThrough: null },
        "events",
        now,
      ),
    ).toEqual({ ...active, gap: null });
  });

  it("marks an event-retention gap without claiming the missing period was fetched", () => {
    expect(
      planReconciliationWindow(
        { active: null, completedThrough: new Date("2026-09-01T12:00:00Z") },
        "events",
        now,
      ),
    ).toEqual({
      from: new Date("2026-09-23T12:00:00Z"),
      to: new Date("2026-10-23T12:00:00Z"),
      cursor: null,
      gap: {
        from: new Date("2026-08-25T12:00:00Z"),
        to: new Date("2026-09-23T12:00:00Z"),
      },
    });
  });

  it("retains an old object window because object reads have no event-retention cutoff", () => {
    expect(
      planReconciliationWindow(
        { active: null, completedThrough: new Date("2026-09-01T12:00:00Z") },
        "refunds",
        now,
      )?.from,
    ).toEqual(new Date("2026-08-25T12:00:00Z"));
  });

  it("restarts expired event pagination with an explicit gap", () => {
    const result = planReconciliationWindow(
      {
        active: {
          from: new Date("2026-08-25T12:00:00Z"),
          to: new Date("2026-09-01T12:00:00Z"),
          cursor: "evt_expired_cursor",
        },
        completedThrough: null,
      },
      "events",
      now,
    );
    expect(result).toEqual({
      from: new Date("2026-09-23T12:00:00Z"),
      to: new Date("2026-10-23T12:00:00Z"),
      cursor: null,
      gap: {
        from: new Date("2026-08-25T12:00:00Z"),
        to: new Date("2026-09-23T12:00:00Z"),
      },
    });
  });

  it("sweeps all unresolved history at a fixed five-minute cutoff", () => {
    expect(
      planReconciliationWindow(empty, "unresolvedOperations", now),
    ).toEqual({
      from: new Date(0),
      to: new Date("2026-10-23T12:00:00Z"),
      cursor: null,
      gap: null,
    });
    expect(
      planReconciliationWindow(
        { active: null, completedThrough: new Date("2026-10-23T12:00:00Z") },
        "unresolvedOperations",
        new Date("2026-10-23T12:04:59Z"),
      ),
    ).toBeNull();
    expect(
      planReconciliationWindow(
        { active: null, completedThrough: new Date("2026-10-23T12:00:00Z") },
        "unresolvedOperations",
        new Date("2026-10-23T12:05:00Z"),
      ),
    ).toMatchObject({
      from: new Date(0),
      to: new Date("2026-10-23T12:05:00Z"),
    });
  });

  it("resumes unresolved pagination even when a newer sweep interval starts", () => {
    const active = {
      from: new Date(0),
      to: new Date("2026-10-23T11:55:00Z"),
      cursor: "mandate:operation",
    };
    expect(
      planReconciliationWindow(
        { active, completedThrough: null },
        "unresolvedOperations",
        now,
      ),
    ).toEqual({ ...active, gap: null });
  });

  it("does not regress completed coverage when the clock moves backwards", () => {
    expect(
      planReconciliationWindow(
        { active: null, completedThrough: new Date("2026-10-24T12:00:00Z") },
        "events",
        now,
      ),
    ).toBeNull();
  });
});
