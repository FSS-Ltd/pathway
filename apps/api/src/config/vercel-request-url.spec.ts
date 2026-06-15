import { normalizeVercelRequestUrl } from "./vercel-request-url";

describe("normalizeVercelRequestUrl", () => {
  it("normalizes Vercel catch-all function URLs back to API route paths", () => {
    expect(normalizeVercelRequestUrl("/api/health")).toBe("/health");
    expect(normalizeVercelRequestUrl("/api/auth/me?x=1")).toBe("/auth/me?x=1");
    expect(normalizeVercelRequestUrl("/health")).toBe("/health");
  });
});
