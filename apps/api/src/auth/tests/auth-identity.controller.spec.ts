import { UnauthorizedException } from "@nestjs/common";
import { AuthIdentityController } from "../auth-identity.controller";
import type { AuthIdentityService } from "../auth-identity.service";

const rolesResponse = {
  userId: "user-super",
  superUser: true,
  currentOrgIsMasterOrg: true,
  orgRoles: [{ orgId: "org-1", role: "ORG_ADMIN" }],
  siteRoles: [{ tenantId: "tenant-1", role: "SITE_ADMIN" }],
  orgMemberships: [
    { orgId: "org-1", orgName: "Victorious Kids", role: "ORG_ADMIN" },
  ],
  siteMemberships: [
    {
      tenantId: "tenant-1",
      tenantName: "Victorious Kids",
      orgId: "org-1",
      role: "SITE_ADMIN",
    },
  ],
  hasFamilyAccess: true,
  hasServeAccess: true,
};

type UserRolesServiceStub = {
  getUserRoles: jest.Mock<Promise<typeof rolesResponse>, [string]>;
};

describe("AuthIdentityController", () => {
  const originalSecret = process.env.INTERNAL_AUTH_SECRET;

  afterEach(() => {
    process.env.INTERNAL_AUTH_SECRET = originalSecret;
    jest.clearAllMocks();
  });

  it("returns trusted role data with the internal identity upsert result", async () => {
    process.env.INTERNAL_AUTH_SECRET = "internal-secret";
    const authIdentityService = {
      upsertFromProvider: jest.fn().mockResolvedValue({
        userId: "user-super",
        email: "jfn@example.com",
        displayName: "Jean-Fidele",
      }),
    } satisfies Pick<AuthIdentityService, "upsertFromProvider">;
    const userRolesService: UserRolesServiceStub = {
      getUserRoles: jest.fn().mockResolvedValue(rolesResponse),
    };
    const Controller = AuthIdentityController as unknown as new (
      authIdentityService: Pick<AuthIdentityService, "upsertFromProvider">,
      userRolesService: UserRolesServiceStub,
    ) => AuthIdentityController;
    const controller = new Controller(authIdentityService, userRolesService);

    const result = await controller.upsertIdentity(
      {
        provider: "auth0",
        subject: "auth0|super",
        email: "jfn@example.com",
        name: "Jean-Fidele",
      },
      "internal-secret",
    );

    expect(userRolesService.getUserRoles).toHaveBeenCalledWith("user-super");
    expect(result).toEqual({
      userId: "user-super",
      email: "jfn@example.com",
      displayName: "Jean-Fidele",
      roles: rolesResponse,
    });
  });

  it("rejects requests without the internal auth secret", async () => {
    process.env.INTERNAL_AUTH_SECRET = "internal-secret";
    const authIdentityService = {
      upsertFromProvider: jest.fn(),
    } satisfies Pick<AuthIdentityService, "upsertFromProvider">;
    const userRolesService: UserRolesServiceStub = {
      getUserRoles: jest.fn(),
    };
    const Controller = AuthIdentityController as unknown as new (
      authIdentityService: Pick<AuthIdentityService, "upsertFromProvider">,
      userRolesService: UserRolesServiceStub,
    ) => AuthIdentityController;
    const controller = new Controller(authIdentityService, userRolesService);

    await expect(
      controller.upsertIdentity(
        {
          provider: "auth0",
          subject: "auth0|super",
        },
        "wrong-secret",
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(authIdentityService.upsertFromProvider).not.toHaveBeenCalled();
    expect(userRolesService.getUserRoles).not.toHaveBeenCalled();
  });
});
