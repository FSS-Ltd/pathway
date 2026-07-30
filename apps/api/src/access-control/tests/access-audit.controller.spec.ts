import { PathwayRequestContext } from "@pathway/auth";
import { AccessAuditController } from "../access-audit.controller";
import { AccessAuditService } from "../access-audit.service";

function createController() {
  const audit = {
    list: jest.fn().mockResolvedValue({ items: [], nextCursor: null }),
  } as unknown as AccessAuditService;
  const requestContext = {
    requireContext: () => ({
      user: { userId: "actor-1" },
      org: { orgId: "org-1" },
      tenant: { tenantId: "site-1" },
      roles: { org: ["org:admin"], tenant: [] },
    }),
  } as unknown as PathwayRequestContext;

  return { audit, controller: new AccessAuditController(audit, requestContext) };
}

describe("AccessAuditController", () => {
  it("passes trusted actor context and parsed query through to the service", async () => {
    const { audit, controller } = createController();
    const request = { headers: { "x-request-id": "access-audit-request-1" } };

    await controller.list({ limit: "10", entityType: "ORG_ROLE" }, request);

    expect(audit.list).toHaveBeenCalledWith(
      {
        orgId: "org-1",
        tenantId: "site-1",
        userId: "actor-1",
        legacyOrgRoles: ["org:admin"],
        requestId: "access-audit-request-1",
      },
      { limit: 10, entityType: "ORG_ROLE" },
    );
  });

  it.each([
    ["an out-of-range limit", { limit: "51" }],
    ["an unknown entityType", { entityType: "CONCERN" }],
    ["an unknown query field", { foo: "bar" }],
  ])("returns a safe validation envelope for %s", async (_name, query) => {
    const { audit, controller } = createController();

    await expect(
      controller.list(query, {
        headers: { "x-request-id": "access-audit-request-invalid" },
      }),
    ).rejects.toMatchObject({
      response: {
        statusCode: 400,
        code: "INVALID_AUDIT_REQUEST",
        requestId: "access-audit-request-invalid",
      },
    });
    expect(audit.list).not.toHaveBeenCalled();
  });
});
