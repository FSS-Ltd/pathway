import { HttpException } from "@nestjs/common";
import { Vertical, type Prisma } from "@prisma/client";
import { assertCanGrantAccessTag } from "../access-tags.delegation";
import type { RoleActorContext } from "../roles.service";

const NOW = new Date("2026-10-06T10:00:00.000Z");
const ACTOR: RoleActorContext = {
  orgId: "org-1",
  tenantId: "site-1",
  userId: "head-1",
  legacyOrgRoles: [],
  requestId: "request-1",
};

interface FixtureOptions {
  head?: boolean;
  assigneeMember?: boolean;
  siteMember?: boolean;
  heldKey?: string | null;
  permissionKeys?: readonly string[];
  permissionActive?: boolean;
  moduleActive?: boolean;
  permissionScope?: "organisation" | "site";
}

function fixture(options: FixtureOptions = {}) {
  const {
    head = true,
    assigneeMember = true,
    siteMember = true,
    heldKey = "attendance.manage",
    permissionKeys,
    permissionActive = true,
    moduleActive = false,
    permissionScope = "site",
  } = options;
  const knownKeys = permissionKeys ?? [heldKey ?? "attendance.manage"];
  const actorKeys = permissionKeys ?? (heldKey ? [heldKey] : []);
  const orgMembershipFindUnique = jest
    .fn()
    .mockResolvedValueOnce(head ? { id: "head-membership" } : null)
    .mockResolvedValueOnce(
      assigneeMember ? { id: "assignee-membership" } : null,
    );
  const roleFindMany = jest.fn().mockResolvedValue(
    actorKeys.length > 0
      ? [
          {
            roleDefinition: {
              permissions: actorKeys.map((permissionKey) => ({
                permissionKey,
              })),
            },
          },
        ]
      : [],
  );
  const tx = {
    userRoleAssignment: {
      findFirst: jest.fn().mockResolvedValue(head ? { id: "head-role" } : null),
      findMany: roleFindMany,
    },
    orgMembership: { findUnique: orgMembershipFindUnique },
    siteMembership: {
      findUnique: jest
        .fn()
        .mockResolvedValue(siteMember ? { id: "site-member" } : null),
    },
    permissionDefinition: {
      findMany: jest.fn().mockResolvedValue(
        knownKeys.map((key) => ({
          key,
          scope: permissionScope,
          delegable: true,
          isActive: permissionActive,
        })),
      ),
    },
    orgVertical: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ vertical: Vertical.ACE_SCHOOL }),
    },
    orgModule: {
      findMany: jest
        .fn()
        .mockResolvedValue(
          moduleActive ? [{ module: "FINANCE", expiresAt: null }] : [],
        ),
    },
    accessTagGrant: { findMany: jest.fn().mockResolvedValue([]) },
  };
  return { tx: tx as unknown as Prisma.TransactionClient, roleFindMany };
}

async function deniedCode(operation: Promise<unknown>): Promise<string> {
  try {
    await operation;
  } catch (error) {
    if (error instanceof HttpException) {
      const response = error.getResponse();
      if (
        typeof response === "object" &&
        response !== null &&
        "code" in response
      ) {
        return String(response.code);
      }
    }
    throw error;
  }
  throw new Error("Expected access-tag delegation to be denied");
}

describe("access-tag delegation", () => {
  it("allows an organisation head to grant a held platform capability", async () => {
    const { tx, roleFindMany } = fixture();

    await expect(
      assertCanGrantAccessTag(
        tx,
        ACTOR,
        {
          userId: "staff-1",
          tagKey: "attendance-recorder",
          scope: "organisation",
        },
        NOW,
      ),
    ).resolves.toBeNull();
    expect(roleFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          roleDefinition: {
            orgId: "org-1",
            isActive: true,
            OR: [{ scope: "organisation", tenantId: null }],
          },
        }),
      }),
    );
  });

  it("requires a fixed head assignment and recipient membership", async () => {
    const noHead = fixture({ head: false });
    await expect(
      deniedCode(
        assertCanGrantAccessTag(
          noHead.tx,
          ACTOR,
          {
            userId: "staff-1",
            tagKey: "attendance-recorder",
            scope: "organisation",
          },
          NOW,
        ),
      ),
    ).resolves.toBe("ACCESS_TAG_ACTOR_NOT_HEAD");

    const noAssignee = fixture({ assigneeMember: false });
    await expect(
      deniedCode(
        assertCanGrantAccessTag(
          noAssignee.tx,
          ACTOR,
          {
            userId: "staff-1",
            tagKey: "attendance-recorder",
            scope: "organisation",
          },
          NOW,
        ),
      ),
    ).resolves.toBe("ASSIGNEE_NOT_IN_ORGANISATION");
  });

  it("requires site membership for a site-scoped tag", async () => {
    const { tx } = fixture({ siteMember: false });
    await expect(
      deniedCode(
        assertCanGrantAccessTag(
          tx,
          ACTOR,
          { userId: "staff-1", tagKey: "attendance-recorder", scope: "site" },
          NOW,
        ),
      ),
    ).resolves.toBe("ACCESS_TAG_ASSIGNEE_NOT_IN_SITE");
  });

  it("denies inactive, unheld, or incompatible permissions", async () => {
    for (const options of [
      { heldKey: null },
      { permissionActive: false },
      { permissionScope: "organisation" as const },
    ]) {
      const { tx } = fixture(options);
      await expect(
        deniedCode(
          assertCanGrantAccessTag(
            tx,
            ACTOR,
            { userId: "staff-1", tagKey: "attendance-recorder", scope: "site" },
            NOW,
          ),
        ),
      ).resolves.toBe("ACCESS_TAG_CANNOT_DELEGATE");
    }
  });

  it("does not let a tag activate Finance or expose a pending protected tag", async () => {
    const financeKeys = [
      "finance.family_invoices.manage",
      "finance.family_payments.record",
      "finance.family_reports.read",
    ];
    const finance = fixture({ permissionKeys: financeKeys });
    await expect(
      deniedCode(
        assertCanGrantAccessTag(
          finance.tx,
          ACTOR,
          { userId: "staff-1", tagKey: "finance-admin", scope: "organisation" },
          NOW,
        ),
      ),
    ).resolves.toBe("ACCESS_TAG_CANNOT_DELEGATE");

    const entitled = fixture({
      permissionKeys: financeKeys,
      moduleActive: true,
    });
    await expect(
      assertCanGrantAccessTag(
        entitled.tx,
        ACTOR,
        { userId: "staff-1", tagKey: "finance-admin", scope: "organisation" },
        NOW,
      ),
    ).resolves.toBeNull();

    const pending = fixture();
    await expect(
      deniedCode(
        assertCanGrantAccessTag(
          pending.tx,
          ACTOR,
          { userId: "staff-1", tagKey: "audit-viewer", scope: "organisation" },
          NOW,
        ),
      ),
    ).resolves.toBe("ACCESS_TAG_UNAVAILABLE");
  });
});
