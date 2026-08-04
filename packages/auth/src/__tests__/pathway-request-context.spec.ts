import { PathwayRequestContext } from "../context/pathway-request-context.service";
import type { RequestWithAuthContext } from "../types/request-with-context";
import type { AuthContext } from "../types/auth-context";

const sampleContext: AuthContext = {
  user: {
    userId: "user-123",
    email: "user@example.com",
    givenName: "Alex",
    familyName: "Green",
    authProvider: "auth0",
  },
  org: {
    orgId: "org-123",
    slug: "green-school",
    name: "Green Primary",
  },
  tenant: {
    tenantId: "tenant-123",
    orgId: "org-123",
    slug: "green-school-main",
  },
  roles: {
    org: [],
    tenant: [],
  },
  permissions: ["attendance:read"],
  rawClaims: {},
};

function buildService(requestOverrides: Partial<RequestWithAuthContext> = {}) {
  const req = {
    headers: {},
    ...requestOverrides,
  } as RequestWithAuthContext;
  return { service: new PathwayRequestContext(req), request: req };
}

describe("PathwayRequestContext", () => {
  it("stores and exposes context IDs once initialised", () => {
    const { service } = buildService();

    service.setContext(sampleContext);

    expect(service.currentUserId).toEqual("user-123");
    expect(service.currentOrgId).toEqual("org-123");
    expect(service.currentTenantId).toEqual("tenant-123");
    expect(service.roles).toEqual(sampleContext.roles);
    expect(service.permissions).toEqual(["attendance:read"]);
  });

  it("throws when requireContext is called before auth", () => {
    const { service } = buildService();
    expect(() => service.requireContext()).toThrow("PathwayRequestContext");
  });
});

