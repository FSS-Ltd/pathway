import {
  combineDateAndTime,
  DURATION_OPTIONS,
  formatDayLabel,
  formatTimeLabel,
  isSameDay,
  TIME_OPTIONS,
  upcomingDayOptions,
} from "./date-options";

describe("upcomingDayOptions", () => {
  it("labels the first day Today and the second Tomorrow", () => {
    const from = new Date("2026-08-02T10:00:00");
    const options = upcomingDayOptions(3, from);

    expect(options).toHaveLength(3);
    expect(options[0].label).toBe("Today");
    expect(options[1].label).toBe("Tomorrow");
  });

  it("labels days beyond tomorrow by weekday name", () => {
    // 2026-08-02 is a Sunday.
    const from = new Date("2026-08-02T10:00:00");
    const options = upcomingDayOptions(5, from);

    expect(options[2].label).toBe("Tue");
    expect(options[3].label).toBe("Wed");
    expect(options[4].label).toBe("Thu");
  });

  it("zeroes the time component of every day", () => {
    const from = new Date("2026-08-02T23:59:00");
    const options = upcomingDayOptions(2, from);

    for (const option of options) {
      expect(option.date.getHours()).toBe(0);
      expect(option.date.getMinutes()).toBe(0);
    }
  });
});

describe("combineDateAndTime", () => {
  it("applies the time option's hour and minute onto the given date", () => {
    const date = new Date("2026-08-05T00:00:00");
    const combined = combineDateAndTime(date, TIME_OPTIONS[0]);

    expect(combined.getFullYear()).toBe(2026);
    expect(combined.getMonth()).toBe(7);
    expect(combined.getDate()).toBe(5);
    expect(combined.getHours()).toBe(TIME_OPTIONS[0].hour);
    expect(combined.getMinutes()).toBe(TIME_OPTIONS[0].minute);
  });

  it("does not mutate the original date", () => {
    const date = new Date("2026-08-05T00:00:00");
    const original = date.getTime();
    combineDateAndTime(date, TIME_OPTIONS[1]);

    expect(date.getTime()).toBe(original);
  });
});

describe("formatDayLabel / formatTimeLabel", () => {
  it("round-trips through combineDateAndTime consistently with upcomingDayOptions", () => {
    const from = new Date("2026-08-02T10:00:00");
    const days = upcomingDayOptions(2, from);
    const scheduled = combineDateAndTime(days[1].date, TIME_OPTIONS[2]);

    // formatDayLabel takes an explicit "now" reference so this assertion
    // doesn't depend on the real wall-clock date staying before `from`.
    expect(formatDayLabel(scheduled, from)).toBe("Tomorrow");
    expect(formatTimeLabel(scheduled)).toBe(TIME_OPTIONS[2].label);
  });

  it("pads single-digit hours and minutes", () => {
    const date = new Date("2026-08-02T09:05:00");
    expect(formatTimeLabel(date)).toBe("09:05");
  });
});

describe("isSameDay", () => {
  it("treats different times on the same calendar day as the same day", () => {
    const a = new Date("2026-08-02T08:00:00");
    const b = new Date("2026-08-02T22:00:00");
    expect(isSameDay(a, b)).toBe(true);
  });

  it("treats midnight-adjacent times on different days as different", () => {
    const a = new Date("2026-08-02T23:59:00");
    const b = new Date("2026-08-03T00:01:00");
    expect(isSameDay(a, b)).toBe(false);
  });
});

describe("DURATION_OPTIONS", () => {
  it("maps every label to a positive minute value", () => {
    for (const option of DURATION_OPTIONS) {
      expect(option.minutes).toBeGreaterThan(0);
    }
  });
});
