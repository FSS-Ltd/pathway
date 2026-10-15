import { addMinorUnits, parseMinorUnits } from "../domain/minor-units";

describe("Finance minor-unit arithmetic", () => {
  it("accepts exact integers and rejects unsafe amounts", () => {
    expect(parseMinorUnits(123)).toBe(123n);
    expect(parseMinorUnits("9007199254740993")).toBe(9007199254740993n);
    expect(() => parseMinorUnits(1.5)).toThrow(RangeError);
    expect(() => parseMinorUnits("1.5")).toThrow(RangeError);
    expect(() => parseMinorUnits(Number.MAX_SAFE_INTEGER + 1)).toThrow(
      RangeError,
    );
    expect(() => parseMinorUnits(9223372036854775808n)).toThrow(RangeError);
  });

  it("adds minor-unit values without overflowing PostgreSQL BIGINT", () => {
    expect(addMinorUnits(100n, 23n)).toBe(123n);
    expect(() => addMinorUnits(9223372036854775807n, 1n)).toThrow(RangeError);
    expect(() => addMinorUnits(9223372036854775808n, -1n)).toThrow(RangeError);
  });
});
