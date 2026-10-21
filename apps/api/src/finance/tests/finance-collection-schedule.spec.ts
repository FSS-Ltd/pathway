import {
  buildFinanceCollectionInstalments,
  splitFinanceInvoiceAmount,
} from "../domain/finance-collection-schedule";

describe("splitFinanceInvoiceAmount", () => {
  it("splits a £300 invoice into three exact £100 instalments", () => {
    expect(splitFinanceInvoiceAmount(30_000n, 3)).toEqual([
      10_000n,
      10_000n,
      10_000n,
    ]);
  });

  it("keeps every penny by assigning the remainder to the final instalment", () => {
    expect(splitFinanceInvoiceAmount(101n, 3)).toEqual([33n, 33n, 35n]);
  });

  it("rejects a split that would create a zero-value instalment", () => {
    expect(() => splitFinanceInvoiceAmount(2n, 3)).toThrow(
      "Finance instalments must each be at least one penny",
    );
  });
});

describe("buildFinanceCollectionInstalments", () => {
  it("moves Christmas collections past the UK-wide bank-holiday closure", () => {
    const instalments = buildFinanceCollectionInstalments(
      30_000n,
      1,
      "2026-12-25",
    );

    expect(instalments[0]?.dueAt.toISOString()).toBe(
      "2026-12-29T00:00:00.000Z",
    );
  });

  it("uses the union of regional UK bank holidays for school collections", () => {
    const lateSummer = buildFinanceCollectionInstalments(
      30_000n,
      1,
      "2026-08-31",
    );
    const stPatricksDay = buildFinanceCollectionInstalments(
      30_000n,
      1,
      "2028-03-17",
    );

    expect(lateSummer[0]?.dueAt.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(stPatricksDay[0]?.dueAt.toISOString()).toBe(
      "2028-03-20T00:00:00.000Z",
    );
  });

  it("keeps the original monthly day when the month is shorter", () => {
    const instalments = buildFinanceCollectionInstalments(
      30_000n,
      3,
      "2026-10-31",
    );

    expect(instalments.map(({ dueAt }) => dueAt.toISOString())).toEqual([
      "2026-11-02T00:00:00.000Z",
      "2026-12-01T00:00:00.000Z",
      "2026-12-31T00:00:00.000Z",
    ]);
  });

  it("uses date-only calendar arithmetic across UK daylight-saving changes", () => {
    const instalments = buildFinanceCollectionInstalments(
      30_000n,
      2,
      "2027-03-28",
    );

    expect(instalments.map(({ dueAt }) => dueAt.toISOString())).toEqual([
      "2027-03-30T00:00:00.000Z",
      "2027-04-28T00:00:00.000Z",
    ]);
  });

  it("fails closed outside the published bank-holiday calendar", () => {
    expect(() =>
      buildFinanceCollectionInstalments(30_000n, 1, "2029-01-01"),
    ).toThrow("Finance business calendar does not cover this collection date");
  });
});
