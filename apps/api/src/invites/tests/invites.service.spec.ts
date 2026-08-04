import { prisma } from "@pathway/db";
import { InvitesService } from "../invites.service";
import { MailerService } from "../../mailer/mailer.service";
import { Auth0ManagementService } from "../../auth/auth0-management.service";
import { OutboxService } from "../../common/outbox/outbox.service";

jest.mock("@pathway/db", () => {
  const { OrgRole, SiteRole, Role } = jest.requireActual("@prisma/client");
  const { SYSTEM_ACTOR_ID, getSystemRoleId, applyTenantContext } =
    jest.requireActual("@pathway/db");
  return {
    OrgRole,
    SiteRole,
    Role,
    SYSTEM_ACTOR_ID,
    getSystemRoleId,
    applyTenantContext,
    prisma: {
      invite: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      orgMembership: {
        upsert: jest.fn(),
      },
      userOrgRole: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      siteMembership: {
        upsert: jest.fn(),
      },
      userTenantRole: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      tenant: {
        findMany: jest.fn(),
      },
      // Used by grantSystemRoleAssignment (system-role-grant.ts).
      orgRoleDefinition: {
        findUnique: jest.fn(),
      },
      userRoleAssignment: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      auditEvent: {
        create: jest.fn(),
      },
      outboxEvent: {
        createMany: jest.fn(),
        findFirstOrThrow: jest.fn(),
      },
      $executeRawUnsafe: jest.fn(),
      $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) => {
        const p = jest.requireMock("@pathway/db").prisma;
        return fn(p);
      }),
    },
  };
});

describe("InvitesService.acceptInvite - typed role grant on invite acceptance", () => {
  let service: InvitesService;
  const mailerMock = { sendInvite: jest.fn() } as unknown as MailerService;
  const auth0Mock = {} as Auth0ManagementService;
  const mockPrisma = prisma as unknown as {
    invite: { findUnique: jest.Mock; update: jest.Mock };
    user: { findUnique: jest.Mock; update: jest.Mock };
    orgMembership: { upsert: jest.Mock };
    userOrgRole: { findFirst: jest.Mock; create: jest.Mock };
    siteMembership: { upsert: jest.Mock };
    userTenantRole: { findFirst: jest.Mock; create: jest.Mock };
    tenant: { findMany: jest.Mock };
    orgRoleDefinition: { findUnique: jest.Mock };
    userRoleAssignment: { findFirst: jest.Mock; create: jest.Mock };
    auditEvent: { create: jest.Mock };
    outboxEvent: { createMany: jest.Mock; findFirstOrThrow: jest.Mock };
  };

  const baseInvite = {
    id: "invite-1",
    orgId: "org-1",
    email: "admin@example.com",
    siteIdsJson: null as string | null,
    usedAt: null,
    revokedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    name: null,
    tokenHash: "hash-1",
    org: { id: "org-1", name: "Org 1" },
  };

  beforeEach(() => {
    service = new InvitesService(mailerMock, auth0Mock, new OutboxService());
    jest.clearAllMocks();

    mockPrisma.orgMembership.upsert.mockResolvedValue({});
    mockPrisma.userOrgRole.findFirst.mockResolvedValue(null);
    mockPrisma.userOrgRole.create.mockResolvedValue({});
    mockPrisma.siteMembership.upsert.mockResolvedValue({});
    mockPrisma.userTenantRole.findFirst.mockResolvedValue(null);
    mockPrisma.userTenantRole.create.mockResolvedValue({});
    mockPrisma.tenant.findMany.mockResolvedValue([]);
    mockPrisma.invite.update.mockResolvedValue({});
    mockPrisma.orgRoleDefinition.findUnique.mockResolvedValue({
      isActive: true,
      isSystem: true,
    });
    mockPrisma.userRoleAssignment.findFirst.mockResolvedValue(null);
    mockPrisma.userRoleAssignment.create.mockResolvedValue({ id: "ura-1" });
    mockPrisma.auditEvent.create.mockResolvedValue({ id: "audit-1" });
    mockPrisma.outboxEvent.createMany.mockResolvedValue({ count: 1 });
    mockPrisma.outboxEvent.findFirstOrThrow.mockResolvedValue({ id: "outbox-1" });
  });

  it("grants the typed Organisation Head assignment when an ORG_ADMIN invite is accepted", async () => {
    mockPrisma.invite.findUnique.mockResolvedValue({
      ...baseInvite,
      orgRole: "ORG_ADMIN",
      siteRole: null,
    });

    await service.acceptInvite("token-1", "user-1", "admin@example.com");

    expect(mockPrisma.orgRoleDefinition.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: expect.stringContaining("organisationHead") },
      }),
    );
    expect(mockPrisma.userRoleAssignment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orgId: "org-1",
        tenantId: null,
        userId: "user-1",
      }),
    });
  });

  it("does not grant Organisation Head for a non-admin (ORG_MEMBER) invite", async () => {
    mockPrisma.invite.findUnique.mockResolvedValue({
      ...baseInvite,
      orgRole: "ORG_MEMBER",
      siteRole: null,
    });

    await service.acceptInvite("token-1", "user-1", "admin@example.com");

    expect(mockPrisma.userRoleAssignment.create).not.toHaveBeenCalled();
  });

  it("grants the typed Site Lead assignment when a SITE_ADMIN invite is accepted", async () => {
    mockPrisma.invite.findUnique.mockResolvedValue({
      ...baseInvite,
      orgRole: null,
      siteRole: "SITE_ADMIN",
      siteIdsJson: JSON.stringify(["site-1"]),
    });

    await service.acceptInvite("token-1", "user-1", "admin@example.com");

    expect(mockPrisma.userRoleAssignment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orgId: "org-1",
        tenantId: "site-1",
        userId: "user-1",
      }),
    });
  });

  it("does not fail invite acceptance when the org's system role isn't seeded yet", async () => {
    mockPrisma.orgRoleDefinition.findUnique.mockResolvedValue(null);
    mockPrisma.invite.findUnique.mockResolvedValue({
      ...baseInvite,
      orgRole: "ORG_ADMIN",
      siteRole: null,
    });

    await expect(
      service.acceptInvite("token-1", "user-1", "admin@example.com"),
    ).resolves.toBeDefined();

    expect(mockPrisma.userRoleAssignment.create).not.toHaveBeenCalled();
    // The rest of the invite flow still completes.
    expect(mockPrisma.orgMembership.upsert).toHaveBeenCalled();
    expect(mockPrisma.invite.update).toHaveBeenCalled();
  });
});
