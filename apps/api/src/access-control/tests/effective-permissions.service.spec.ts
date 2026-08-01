import type { PermissionKey } from "@pathway/platform";
import { Test } from "@nestjs/testing";
import { AccessControlModule } from "../access-control.module";
import { AccessCacheService } from "../access-cache.service";
import {
  EFFECTIVE_PERMISSIONS_CONTEXT,
  EFFECTIVE_PERMISSIONS_READER,
  EffectivePermissionsService,
  ORG_CAPABILITIES_READER,
  type EffectivePermissionsReader,
  type EffectivePermissionsContext,
  type FeatureAvailabilityReader,
  type OrgCapabilitiesReader,
} from "../effective-permissions.service";

const NOW = new Date("2026-07-28T12:00:00.000Z");
const ORG_ID = "org-1";
const SITE_ID = "site-1";
const USER_ID = "user-1";
const OTHER_SITE_ID = "site-2";

const testPermissionsContext: EffectivePermissionsContext = {
  async run(_orgId, _tenantId, operation) {
    return operation();
  },
};

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
    testPermissionsContext,
    new AccessCacheService(),
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
      testPermissionsContext,
      new AccessCacheService(),
    );

    await resolve(service);
    await resolve(service, { tenantId: SITE_ID });

    expect(requestedTenantIds).toEqual([undefined, SITE_ID]);
  });

  it("uses the shared access cache and reloads after user invalidation", async () => {
    const getOrganisationMembership = jest.fn().mockResolvedValue(true);
    const findAssignments = jest.fn().mockResolvedValue([grant()]);
    const cache = new AccessCacheService();
    const service = new EffectivePermissionsService(
      { getOrganisationMembership, findAssignments },
      { get: async () => ["ace.pace.read"] },
      { isAvailable: async () => true },
      testPermissionsContext,
      cache,
    );

    await resolve(service, { tenantId: SITE_ID });
    await resolve(service, { tenantId: SITE_ID });
    expect(getOrganisationMembership).toHaveBeenCalledTimes(1);
    expect(findAssignments).toHaveBeenCalledTimes(1);

    await cache.invalidateUser(USER_ID, ORG_ID);
    await resolve(service, { tenantId: SITE_ID });

    expect(getOrganisationMembership).toHaveBeenCalledTimes(2);
    expect(findAssignments).toHaveBeenCalledTimes(2);
  });

  it("reuses a shared cached snapshot but denies it once its assignment expires", async () => {
    const expiresAt = new Date(NOW.getTime() + 1_000);
    const findAssignments = jest
      .fn()
      .mockResolvedValue([grant({ expiresAt })]);
    const service = new EffectivePermissionsService(
      {
        getOrganisationMembership: async () => true,
        findAssignments,
      },
      { get: async () => ["ace.pace.read"] },
      { isAvailable: async () => true },
      testPermissionsContext,
      new AccessCacheService(),
    );

    await expect(resolve(service)).resolves.toMatchObject({
      allowed: true,
    });
    await expect(
      resolve(service, { now: expiresAt }),
    ).resolves.toEqual({
      allowed: false,
      reason: "permission-missing",
      sourceRoleIds: [],
    });
    expect(findAssignments).toHaveBeenCalledTimes(1);
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

  it.each([
    ["a required module", "finance.family_invoices.read" as PermissionKey],
    ["a required vertical", "ace.pace.read" as PermissionKey],
  ])(
    "returns capability-missing when %s is unavailable",
    async (_requirement, permission) => {
      const decision = await resolve(
        createService({
          grants: [grant({ permissionKey: permission })],
          capabilities: [],
        }),
        { permission },
      );

      expect(decision).toEqual({
        allowed: false,
        reason: "capability-missing",
        sourceRoleIds: [],
      });
    },
  );

  it("denies a disabled feature through the injected availability port", async () => {
    const decision = await resolve(createService({ available: false }));

    expect(decision).toEqual({
      allowed: false,
      reason: "feature-disabled",
      sourceRoleIds: [],
    });
  });

  it("allows a permission key that declares no feature toggle, using the real module wiring", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AccessControlModule],
    })
      .overrideProvider(EFFECTIVE_PERMISSIONS_READER)
      .useValue({
        getOrganisationMembership: async () => true,
        findAssignments: async () => [grant()],
      } satisfies EffectivePermissionsReader)
      .overrideProvider(ORG_CAPABILITIES_READER)
      .useValue({
        get: async () => ["ace.pace.read"],
      } satisfies OrgCapabilitiesReader)
      .overrideProvider(EFFECTIVE_PERMISSIONS_CONTEXT)
      .useValue({
        run: async (_orgId, _tenantId, operation) => operation(),
      } satisfies EffectivePermissionsContext)
      .compile();

    try {
      await expect(
        resolve(moduleRef.get(EffectivePermissionsService)),
      ).resolves.toEqual({
        allowed: true,
        reason: "allowed",
        sourceRoleIds: ["role-1"],
      });
    } finally {
      await moduleRef.close();
    }
  });

  it("denies an unregistered permission key by default, using the real module wiring", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AccessControlModule],
    })
      .overrideProvider(EFFECTIVE_PERMISSIONS_READER)
      .useValue({
        getOrganisationMembership: async () => true,
        findAssignments: async () => [
          grant({ permissionKey: "unregistered.key" as PermissionKey }),
        ],
      } satisfies EffectivePermissionsReader)
      .overrideProvider(ORG_CAPABILITIES_READER)
      .useValue({
        get: async () => ["unregistered.key" as PermissionKey],
      } satisfies OrgCapabilitiesReader)
      .overrideProvider(EFFECTIVE_PERMISSIONS_CONTEXT)
      .useValue({
        run: async (_orgId, _tenantId, operation) => operation(),
      } satisfies EffectivePermissionsContext)
      .compile();

    try {
      await expect(
        resolve(moduleRef.get(EffectivePermissionsService), {
          permission: "unregistered.key" as PermissionKey,
        }),
      ).resolves.toEqual({
        allowed: false,
        reason: "feature-disabled",
        sourceRoleIds: [],
      });
    } finally {
      await moduleRef.close();
    }
  });

  it("denies a user without an active organisation membership", async () => {
    const decision = await resolve(createService({ hasMembership: false }));

    expect(decision).toEqual({
      allowed: false,
      reason: "no-membership",
      sourceRoleIds: [],
    });
  });

  it.each([
    [
      "future assignment",
      { grants: [grant({ startsAt: new Date("2100-01-01") })] },
      undefined,
    ],
    [
      "expired assignment",
      { grants: [grant({ expiresAt: new Date(0) })] },
      undefined,
    ],
    [
      "revoked assignment",
      { grants: [grant({ revokedAt: new Date(0) })] },
      undefined,
    ],
    ["inactive role", { grants: [grant({ roleIsActive: false })] }, undefined],
    [
      "inactive permission",
      { grants: [grant({ permissionIsActive: false })] },
      undefined,
    ],
    ["disabled feature", { available: false }, undefined],
    [
      "site role at another tenant",
      { grants: [grant({ roleScope: "site", roleTenantId: SITE_ID })] },
      OTHER_SITE_ID,
    ],
    ["missing organisation membership", { hasMembership: false }, undefined],
  ] as const)(
    "omits a %s from listForUser",
    async (_name, options, tenantId) => {
      await expect(
        createService(options).listForUser(USER_ID, ORG_ID, tenantId),
      ).resolves.toEqual([]);
    },
  );

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

  it.each([
    [
      "future assignment",
      { grants: [grant({ startsAt: new Date("2100-01-01") })] },
      undefined,
    ],
    [
      "expired assignment",
      { grants: [grant({ expiresAt: new Date(0) })] },
      undefined,
    ],
    [
      "revoked assignment",
      { grants: [grant({ revokedAt: new Date(0) })] },
      undefined,
    ],
    ["inactive role", { grants: [grant({ roleIsActive: false })] }, undefined],
    [
      "inactive permission",
      { grants: [grant({ permissionIsActive: false })] },
      undefined,
    ],
    ["disabled feature", { available: false }, undefined],
    [
      "site role at another tenant",
      { grants: [grant({ roleScope: "site", roleTenantId: SITE_ID })] },
      OTHER_SITE_ID,
    ],
    ["missing organisation membership", { hasMembership: false }, undefined],
  ] as const)(
    "omits a %s from listForUserWithSources",
    async (_name, options, tenantId) => {
      await expect(
        createService(options).listForUserWithSources(
          USER_ID,
          ORG_ID,
          tenantId,
        ),
      ).resolves.toEqual([]);
    },
  );

  it("deduplicates and sorts source role ids per permission key", async () => {
    const service = createService({
      grants: [
        grant({ roleId: "role-z", startsAt: new Date(0) }),
        grant({ roleId: "role-a", startsAt: new Date(0) }),
        grant({ roleId: "role-a", startsAt: new Date(0) }),
        grant({
          roleId: "role-other-permission",
          permissionKey: "ace.behaviour.read",
          startsAt: new Date(0),
        }),
      ],
      capabilities: ["ace.behaviour.read", "ace.pace.read"],
    });

    await expect(
      service.listForUserWithSources(USER_ID, ORG_ID),
    ).resolves.toEqual([
      { permissionKey: "ace.behaviour.read", sourceRoleIds: ["role-other-permission"] },
      { permissionKey: "ace.pace.read", sourceRoleIds: ["role-a", "role-z"] },
    ]);
  });
});
