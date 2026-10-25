import { isEmail } from "../auth-identity.service";

describe("isEmail", () => {
  it("accepts a normal address and trims whitespace", () => {
    expect(isEmail("alice@example.com")).toBe(true);
    expect(isEmail("  alice@example.com ")).toBe(true);
  });

  it("rejects names, empty and nullish values", () => {
    expect(isEmail("Alice Doe")).toBe(false);
    expect(isEmail("")).toBe(false);
    expect(isEmail(null)).toBe(false);
    expect(isEmail(undefined)).toBe(false);
  });

  it("rejects oversized input quickly instead of running the regex", () => {
    const hostile = `${"a@".repeat(60_000)}.`;
    const start = Date.now();
    expect(isEmail(hostile)).toBe(false);
    expect(Date.now() - start).toBeLessThan(100);
  });
});
