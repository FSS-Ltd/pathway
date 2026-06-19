import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import { OrgPeopleService } from "../org-people.service";
import { OrgRole } from "@pathway/db";

jest.mock("@pathway/db", () => ({
  prisma: (() => {
    const tx = {
      orgDeletedUser: { create: jest.fn() },
      orgMembership: { deleteMany: jest.fn() },
      userOrgRole: { deleteMany: jest.fn() },
      siteMembership: { deleteMany: jest.fn() },
      userTenantRole: { deleteMany: jest.fn() },
      user: { update: jest.fn() },
    };
    return {
      __tx: tx,
      orgMembership: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      userOrgRole: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      orgDeletedUser: {
        findMany: jest.fn(),
      },
      tenant: {
        findMany: jest.fn(),
      },
      siteMembership: {
        findMany: jest.fn(),
      },
      invite: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
      user: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      $transaction: jest.fn(async <T>(callback: (txClient: typeof tx) => Promise<T>) =>
        callback(tx),
      ),
    };
  })(),
  OrgRole: {
    ORG_ADMIN: "ORG_ADMIN",
    ORG_MEMBER: "ORG_MEMBER",
    ORG_BILLING: "ORG_BILLING",
  },
}));

const { prisma: mockPrisma } = jest.requireMock("@pathway/db") as {
  prisma: {
    __tx: {
      orgDeletedUser: { create: jest.Mock };
      orgMembership: { deleteMany: jest.Mock };
      userOrgRole: { deleteMany: jest.Mock };
      siteMembership: { deleteMany: jest.Mock };
      userTenantRole: { deleteMany: jest.Mock };
      user: { update: jest.Mock };
    };
    orgMembership: { findFirst: jest.Mock; findMany: jest.Mock };
    userOrgRole: { findFirst: jest.Mock; findMany: jest.Mock };
    orgDeletedUser: { findMany: jest.Mock };
    tenant: { findMany: jest.Mock };
    siteMembership: { findMany: jest.Mock };
    invite: { findMany: jest.Mock; findFirst: jest.Mock };
    user: { findMany: jest.Mock; findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
};
const mockTx = mockPrisma.__tx;

describe("OrgPeopleService", () => {
  let service: OrgPeopleService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new OrgPeopleService();
    mockPrisma.orgMembership.findFirst.mockResolvedValue({
      role: OrgRole.ORG_ADMIN,
    });
    mockPrisma.userOrgRole.findFirst.mockResolvedValue(null);
    mockPrisma.tenant.findMany.mockResolvedValue([
      { id: "site-1" },
      { id: "site-2" },
    ]);
    mockPrisma.orgDeletedUser.findMany.mockResolvedValue([]);
    mockPrisma.orgMembership.findMany.mockResolvedValue([]);
    mockPrisma.userOrgRole.findMany.mockResolvedValue([]);
    mockPrisma.siteMembership.findMany.mockResolvedValue([]);
    mockPrisma.invite.findMany.mockResolvedValue([]);
    mockPrisma.user.findMany.mockResolvedValue([]);
  });

  it("removes another user's org and site access and records a deleted user", async () => {
    const deletedAt = new Date("2026-06-19T09:00:00.000Z");
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "staff-user",
      name: "Staff User",
      displayName: "Staff User",
      email: "staff@example.test",
      lastActiveTenantId: "site-1",
      orgMemberships: [{ role: OrgRole.ORG_MEMBER }],
      orgRoles: [],
      siteMemberships: [{ tenantId: "site-1" }],
      roles: [{ tenantId: "site-2" }],
      identities: [{ id: "identity-1" }],
    });
    mockPrisma.invite.findFirst.mockResolvedValue(null);
    mockTx.orgDeletedUser.create.mockResolvedValue({
      id: "deleted-1",
      userId: "staff-user",
      name: "Staff User",
      displayName: "Staff User",
      email: "staff@example.test",
      priorOrgRole: OrgRole.ORG_MEMBER,
      priorSiteCount: 2,
      deletedAt,
      deletedByUserId: "admin-user",
    });

    const result = await service.removePerson(
      "org-1",
      "staff-user",
      "admin-user",
    );

    expect(result).toEqual(
      expect.objectContaining({
        id: "deleted-1",
        userId: "staff-user",
        priorSiteCount: 2,
      }),
    );
    expect(mockTx.orgDeletedUser.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orgId: "org-1",
          userId: "staff-user",
          deletedByUserId: "admin-user",
          name: "Staff User",
          priorOrgRole: OrgRole.ORG_MEMBER,
          priorSiteCount: 2,
        }),
      }),
    );
    expect(mockTx.orgMembership.deleteMany).toHaveBeenCalledWith({
      where: { orgId: "org-1", userId: "staff-user" },
    });
    expect(mockTx.userOrgRole.deleteMany).toHaveBeenCalledWith({
      where: { orgId: "org-1", userId: "staff-user" },
    });
    expect(mockTx.siteMembership.deleteMany).toHaveBeenCalledWith({
      where: { userId: "staff-user", tenantId: { in: ["site-1", "site-2"] } },
    });
    expect(mockTx.userTenantRole.deleteMany).toHaveBeenCalledWith({
      where: { userId: "staff-user", tenantId: { in: ["site-1", "site-2"] } },
    });
    expect(mockTx.user.update).toHaveBeenCalledWith({
      where: { id: "staff-user" },
      data: { lastActiveTenantId: null },
    });
  });

  it("rejects non-org-admin users", async () => {
    mockPrisma.orgMembership.findFirst.mockResolvedValue(null);
    mockPrisma.userOrgRole.findFirst.mockResolvedValue(null);

    await expect(
      service.removePerson("org-1", "staff-user", "site-admin"),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("rejects self deletion", async () => {
    await expect(
      service.removePerson("org-1", "admin-user", "admin-user"),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("lists deleted users for the organisation", async () => {
    const deletedAt = new Date("2026-06-19T09:00:00.000Z");
    mockPrisma.orgDeletedUser.findMany.mockResolvedValue([
      {
        id: "deleted-1",
        userId: "staff-user",
        name: "Staff User",
        displayName: "Staff User",
        email: "staff@example.test",
        priorOrgRole: OrgRole.ORG_MEMBER,
        priorSiteCount: 1,
        deletedAt,
        deletedByUserId: "admin-user",
      },
    ]);

    const result = await service.listDeletedPeople("org-1", "admin-user");

    expect(result).toEqual([
      expect.objectContaining({
        id: "deleted-1",
        userId: "staff-user",
        deletedByUserId: "admin-user",
      }),
    ]);
    expect(mockPrisma.orgDeletedUser.findMany).toHaveBeenCalledWith({
      where: { orgId: "org-1" },
      orderBy: { deletedAt: "desc" },
      select: expect.any(Object),
    });
  });

  it("excludes deleted invite-only users from the active people list", async () => {
    mockPrisma.tenant.findMany.mockResolvedValue([{ id: "site-1" }]);
    mockPrisma.orgDeletedUser.findMany.mockResolvedValue([
      { userId: "deleted-user" },
    ]);
    mockPrisma.invite.findMany.mockResolvedValue([
      { email: "active@example.test", orgRole: OrgRole.ORG_MEMBER },
      { email: "deleted@example.test", orgRole: OrgRole.ORG_MEMBER },
    ]);
    mockPrisma.user.findMany.mockResolvedValue([
      {
        id: "active-user",
        name: "Active User",
        displayName: "Active User",
        email: "active@example.test",
      },
      {
        id: "deleted-user",
        name: "Deleted User",
        displayName: "Deleted User",
        email: "deleted@example.test",
      },
    ]);

    const result = await service.listPeople("org-1", "admin-user");

    expect(result).toEqual([
      expect.objectContaining({
        id: "active-user",
        email: "active@example.test",
      }),
    ]);
  });
});
