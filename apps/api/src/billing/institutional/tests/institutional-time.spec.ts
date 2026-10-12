import {
  censusCutoffFor,
  localDateAt,
  QUOTE_VALIDITY_MS,
} from "../institutional-time";

it("freezes seven elapsed days before renewal through the UK DST change", () => {
  const renewal = new Date("2026-11-01T00:00:00.000Z");
  expect(censusCutoffFor(renewal).toISOString()).toBe(
    "2026-10-25T00:00:00.000Z",
  );
  expect(localDateAt(renewal, "Europe/London")).toBe("2026-11-01");
  expect(
    localDateAt(new Date("2026-07-01T23:30:00.000Z"), "Europe/London"),
  ).toBe("2026-07-02");
  expect(QUOTE_VALIDITY_MS).toBe(15 * 60 * 1_000);
});
