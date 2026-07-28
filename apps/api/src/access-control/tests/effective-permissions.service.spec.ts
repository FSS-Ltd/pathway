import type { PermissionKey } from "@pathway/platform";
import {
  EffectivePermissionsService,
  type EffectivePermissionsReader,
  type FeatureAvailabilityReader,
  type OrgCapabilitiesReader,
} from "../effective-permissions.service";

const NOW = new Date("2026-07-28T12:00:00.000Z");
const ORG_ID = "org-1";
const SITE_ID = "site-1";
const USER_ID = "user-1";
const OTHER_SITE_ID = "site-2";

type Grant = Awaited<
  ReturnType<EffectivePermissionsReader["findAssignments"]>
>[number];

function grant(overrides: Partial<Grant> = {}): Grant {
  return {
    roleId: "role-1",
    roleScope: "organisation",
    roleTenantId: null,
    roleIsActive: true,
    permissionKey: "ace.pace.read",
    permissionIsActive: true,
    startsAt: new Date("2026-07-28T11:00:00.000Z"),
    expiresAt: null,
    revokedAt: null,
    ...overrides,
  };
}

function createService({
  hasMembership = true,
  grants = [grant()],
  capabilities = ["ace.pace.read" as PermissionKey],
  available = true,
}: {
  hasMembership?: boolean;
  grants?: readonly Grant[];
  capabilities?: readonly PermissionKey[];
  available?: boolean;
} = {}): EffectivePermissionsService {
  const reader: EffectivePermissionsReader = {
    getOrganisationMembership: async () => hasMembership,
    findAssignments: async () => grants,
  };
  const capabilityReader: OrgCapabilitiesReader = {
    get: async () => capabilities,
  };
  const featureAvailability: FeatureAvailabilityReader = {
    isAvailable: async () => available,
  };

  return new EffectivePermissionsService(
    reader,
    capabilityReader,
    featureAvailability,
  );
}

async function resolve(
  service: EffectivePermissionsService,
  overrides: Partial<{
    userId: string;
    orgId: string;
    tenantId: string;
    permission: PermissionKey;
    now: Date;
  }> = {},
) {
  return service.resolve({
    userId: USER_ID,
    orgId: ORG_ID,
    permission: "ace.pace.read",
    now: NOW,
    ...overrides,
  });
}

describe("EffectivePermissionsService", () => {
  it("allows an organisation role grant for an active organisation member", async () => {
    const decision = await resolve(createService());

    expect(decision).toEqual({
      allowed: true,
      reason: "allowed",
      sourceRoleIds: ["role-1"],
    });
  });

  it("allows a site role only for its matching tenant", async () => {
    const service = createService({
      grants: [
        grant({
          roleId: "site-role",
          roleScope: "site",
          roleTenantId: SITE_ID,
        }),
      ],
    });

    await expect(resolve(service, { tenantId: SITE_ID })).resolves.toEqual({
      allowed: true,
      reason: "allowed",
      sourceRoleIds: ["site-role"],
    });
    await expect(
      resolve(service, { tenantId: OTHER_SITE_ID }),
    ).resolves.toEqual({
      allowed: false,
      reason: "permission-missing",
      sourceRoleIds: [],
    });
  });

  it("does not let a site role grant an organisation-wide request", async () => {
    const decision = await resolve(
      createService({
        grants: [
          grant({
            roleScope: "site",
            roleTenantId: SITE_ID,
          }),
        ],
      }),
    );

    expect(decision).toEqual({
      allowed: false,
      reason: "permission-missing",
      sourceRoleIds: [],
    });
  });

  it("requests only organisation or matching site assignment scopes", async () => {
    const requestedTenantIds: Array<string | undefined> = [];
    const reader: EffectivePermissionsReader = {
      getOrganisationMembership: async () => true,
      findAssignments: async (_userId, _orgId, tenantId) => {
        requestedTenantIds.push(tenantId);
        return [grant({ roleScope: "site", roleTenantId: SITE_ID })];
      },
    };
    const service = new EffectivePermissionsService(
      reader,
      { get: async () => ["ace.pace.read"] },
      { isAvailable: async () => true },
    );

    await resolve(service);
    await resolve(service, { tenantId: SITE_ID });

    expect(requestedTenantIds).toEqual([undefined, SITE_ID]);
  });

  it.each([
    ["future start", { startsAt: new Date("2026-07-28T12:00:01.000Z") }],
    ["expiry", { expiresAt: new Date("2026-07-28T12:00:00.000Z") }],
    ["revocation", { revokedAt: new Date("2026-07-28T11:00:00.000Z") }],
  ] as const)("denies a %s assignment", async (_name, overrides) => {
    const decision = await resolve(
      createService({ grants: [grant(overrides)] }),
    );

    expect(decision).toEqual({
      allowed: false,
      reason: "permission-missing",
      sourceRoleIds: [],
    });
  });

  it("denies an inactive role", async () => {
    const decision = await resolve(
      createService({ grants: [grant({ roleIsActive: false })] }),
    );

    expect(decision).toEqual({
      allowed: false,
      reason: "permission-missing",
      sourceRoleIds: [],
    });
  });

  it("fails closed when the persisted permission definition is inactive", async () => {
    const decision = await resolve(
      createService({ grants: [grant({ permissionIsActive: false })] }),
    );

    expect(decision).toEqual({
      allowed: false,
      reason: "feature-disabled",
      sourceRoleIds: [],
    });
  });

  it("denies when the commercial capability is missing", async () => {
    const decision = await resolve(createService({ capabilities: [] }));

    expect(decision).toEqual({
      allowed: false,
      reason: "capability-missing",
      sourceRoleIds: [],
    });
  });

  it("denies a disabled feature through the injected availability port", async () => {
    const decision = await resolve(createService({ available: false }));

    expect(decision).toEqual({
      allowed: false,
      reason: "feature-disabled",
      sourceRoleIds: [],
    });
  });

  it("denies a user without an active organisation membership", async () => {
    const decision = await resolve(createService({ hasMembership: false }));

    expect(decision).toEqual({
      allowed: false,
      reason: "no-membership",
      sourceRoleIds: [],
    });
  });

  it("deduplicates permissions and deterministically redacts source roles", async () => {
    const service = createService({
      grants: [
        grant({ roleId: "role-z", startsAt: new Date(0) }),
        grant({ roleId: "role-a", startsAt: new Date(0) }),
        grant({
          roleId: "role-other-permission",
          permissionKey: "ace.behaviour.read",
          startsAt: new Date(0),
        }),
      ],
      capabilities: ["ace.behaviour.read", "ace.pace.read"],
    });

    await expect(service.listForUser(USER_ID, ORG_ID)).resolves.toEqual([
      "ace.behaviour.read",
      "ace.pace.read",
    ]);
    await expect(resolve(service)).resolves.toEqual({
      allowed: true,
      reason: "allowed",
      sourceRoleIds: ["role-a", "role-z"],
    });
  });
});
