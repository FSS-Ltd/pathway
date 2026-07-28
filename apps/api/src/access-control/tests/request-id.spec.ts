import { getOrCreateRequestId } from "../request-id";

describe("getOrCreateRequestId", () => {
  it("echoes the first inbound request ID when a proxy supplies an array header", () => {
    const request = {
      headers: { "x-request-id": ["request-1", "request-2"] },
    };

    expect(getOrCreateRequestId(request)).toBe("request-1");
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
