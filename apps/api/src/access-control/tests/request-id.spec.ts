import { getOrCreateRequestId } from "../request-id";

describe("getOrCreateRequestId", () => {
  it("preserves valid visible ASCII request IDs through the 128-character boundary", () => {
    const requestId = "r".repeat(128);

    expect(
      getOrCreateRequestId({ headers: { "x-request-id": requestId } }),
    ).toBe(requestId);
  });

  it("echoes the first inbound request ID when a proxy supplies an array header", () => {
    const request = {
      headers: { "x-request-id": ["request-1", "request-2"] },
    };

    expect(getOrCreateRequestId(request)).toBe("request-1");
  });

  it.each([
    ["an oversized value", "r".repeat(129)],
    ["an empty value", ""],
    ["a space", "request id"],
    ["a tab", "request\tid"],
    ["a control character", "request\u0007id"],
    ["non-ASCII text", "requête"],
  ])("memoizes a UUID fallback for %s", (_caseName, requestId) => {
    const request = { headers: { "x-request-id": requestId } };
    const fallback = getOrCreateRequestId(request);

    expect(fallback).toMatch(/^[0-9a-f-]{36}$/i);
    expect(fallback).not.toBe(requestId);
    expect(getOrCreateRequestId(request)).toBe(fallback);
  });

  it("uses only the first array value when validating an inbound header", () => {
    const validSecondValue = "request-2";
    const request = {
      headers: { "x-request-id": ["r".repeat(129), validSecondValue] },
    };

    expect(getOrCreateRequestId(request)).toMatch(/^[0-9a-f-]{36}$/i);
    expect(getOrCreateRequestId(request)).not.toBe(validSecondValue);
  });

  it("creates one fallback per request when the header is absent", () => {
    const firstRequest = { headers: {} };
    const secondRequest = { headers: {} };

    const firstId = getOrCreateRequestId(firstRequest);

    expect(getOrCreateRequestId(firstRequest)).toBe(firstId);
    expect(firstId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(getOrCreateRequestId(secondRequest)).not.toBe(firstId);
  });
});
