import {
  decodeCreatedAtIdCursor,
  encodeCreatedAtIdCursor,
} from "../cursor";

describe("createdAt/id cursor codec", () => {
  it("round-trips a cursor through encode and decode", () => {
    const createdAt = new Date("2026-07-30T12:00:00.000Z");
    const encoded = encodeCreatedAtIdCursor({ createdAt, id: "row-1" });
    expect(decodeCreatedAtIdCursor(encoded)).toEqual({
      createdAt,
      id: "row-1",
    });
  });

  it("throws on malformed base64url input", () => {
    expect(() => decodeCreatedAtIdCursor("not-valid-base64url!!!")).toThrow();
  });

  it("throws on well-formed JSON missing required fields", () => {
    const encoded = Buffer.from(JSON.stringify({ createdAt: "2026-07-30T12:00:00.000Z" }))
      .toString("base64url");
    expect(() => decodeCreatedAtIdCursor(encoded)).toThrow();
  });

  it("throws on a non-ISO createdAt value", () => {
    const encoded = Buffer.from(
      JSON.stringify({ createdAt: "not-a-date", id: "row-1" }),
    ).toString("base64url");
    expect(() => decodeCreatedAtIdCursor(encoded)).toThrow();
  });

  it("throws on an empty id", () => {
    const encoded = Buffer.from(
      JSON.stringify({ createdAt: new Date().toISOString(), id: "" }),
    ).toString("base64url");
    expect(() => decodeCreatedAtIdCursor(encoded)).toThrow();
  });

  it("throws on an id longer than 128 characters", () => {
    const encoded = Buffer.from(
      JSON.stringify({
        createdAt: new Date().toISOString(),
        id: "x".repeat(129),
      }),
    ).toString("base64url");
    expect(() => decodeCreatedAtIdCursor(encoded)).toThrow();
  });
});
