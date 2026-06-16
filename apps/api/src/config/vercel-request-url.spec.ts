import {
  normalizeVercelRequestUrl,
  stripVercelRoutingQueryParam,
} from "./vercel-request-url";

describe("normalizeVercelRequestUrl", () => {
  it("normalizes Vercel catch-all function URLs back to API route paths", () => {
    expect(normalizeVercelRequestUrl("/api/health")).toBe("/health");
    expect(normalizeVercelRequestUrl("/api/auth/me?x=1")).toBe("/auth/me?x=1");
    expect(normalizeVercelRequestUrl("/health")).toBe("/health");
  });

  it("reconstructs nested paths from Vercel route destinations", () => {
    expect(
      normalizeVercelRequestUrl(
        "/api/[...path].js?__vercel_path=auth/active-site/roles",
      ),
    ).toBe("/auth/active-site/roles");
    expect(
      normalizeVercelRequestUrl(
        "/api/[...path].js?__vercel_path=auth/active-site/roles&x=1",
      ),
    ).toBe("/auth/active-site/roles?x=1");
    expect(
      normalizeVercelRequestUrl("/api/[...path].js?__vercel_path="),
    ).toBe("/");
  });

  it("strips Vercel routing metadata from parsed query objects", () => {
    const query = {
      __vercel_path: "announcements",
      audience: "ALL",
    };

    stripVercelRoutingQueryParam(query);

    expect(query).toEqual({ audience: "ALL" });
  });
});
