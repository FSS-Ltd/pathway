import { ConflictException, ServiceUnavailableException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { prisma } from "@pathway/db";
import { NexstepsHomeSignupService } from "../nexsteps-home-signup.service";
import { Auth0ManagementService } from "../../auth/auth0-management.service";

jest.mock("@pathway/db", () => {
  const { OrgRole, Role } = jest.requireActual("@prisma/client");
  return {
    OrgRole,
    Role,
    prisma: {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      org: {
        create: jest.fn(),
        findUnique: jest.fn(),
      },
      tenant: {
        create: jest.fn(),
      },
      orgVertical: {
        create: jest.fn(),
      },
      userIdentity: {
        create: jest.fn(),
      },
      userTenantRole: {
        create: jest.fn(),
      },
      userOrgRole: {
        create: jest.fn(),
      },
      orgMembership: {
        create: jest.fn(),
      },
      siteMembership: {
        create: jest.fn(),
      },
      $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) => {
        const p = jest.requireMock("@pathway/db").prisma;
        return fn(p);
      }),
    },
  };
});

describe("NexstepsHomeSignupService", () => {
  let service: NexstepsHomeSignupService;
  const auth0Mock = { createUser: jest.fn() };
  const mockPrisma = prisma as unknown as {
    user: { findUnique: jest.Mock; create: jest.Mock };
    org: { create: jest.Mock; findUnique: jest.Mock };
    tenant: { create: jest.Mock };
    orgVertical: { create: jest.Mock };
    userIdentity: { create: jest.Mock };
    userTenantRole: { create: jest.Mock };
    userOrgRole: { create: jest.Mock };
    orgMembership: { create: jest.Mock };
    siteMembership: { create: jest.Mock };
  };

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        NexstepsHomeSignupService,
        { provide: Auth0ManagementService, useValue: auth0Mock },
      ],
    }).compile();

    service = moduleRef.get(NexstepsHomeSignupService);
    jest.clearAllMocks();

    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.org.findUnique.mockResolvedValue(null);
    auth0Mock.createUser.mockResolvedValue("auth0|new-user");
    mockPrisma.org.create.mockResolvedValue({ id: "org-1", slug: "sarah-family-abc123" });
    mockPrisma.tenant.create.mockResolvedValue({ id: "tenant-1" });
    mockPrisma.orgVertical.create.mockResolvedValue({ id: "ov-1" });
    mockPrisma.user.create.mockResolvedValue({ id: "user-1" });
    mockPrisma.userIdentity.create.mockResolvedValue({ id: "identity-1" });
    mockPrisma.userTenantRole.create.mockResolvedValue({ id: "utr-1" });
    mockPrisma.userOrgRole.create.mockResolvedValue({ id: "uor-1" });
    mockPrisma.orgMembership.create.mockResolvedValue({ id: "om-1" });
    mockPrisma.siteMembership.create.mockResolvedValue({ id: "sm-1" });
  });

  it("creates the Auth0 user, org, tenant and roles for a new household", async () => {
    const result = await service.signup({
      email: "Sarah@Example.com",
      password: "a-secure-password",
    });

    expect(result).toEqual({ success: true, orgId: "org-1", tenantId: "tenant-1" });

    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: "sarah@example.com" },
    });

    expect(auth0Mock.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "sarah@example.com",
        password: "a-secure-password",
        connection: "Username-Password-Authentication",
        emailVerified: false,
      }),
    );

    expect(mockPrisma.org.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: "Sarah's Family",
        planCode: "HOME_FREE",
        isSuite: false,
      }),
    });

    expect(mockPrisma.orgVertical.create).toHaveBeenCalledWith({
      data: { orgId: "org-1", vertical: "HOME_EDUCATION" },
    });

    expect(mockPrisma.userIdentity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        provider: "auth0",
        providerSubject: "auth0|new-user",
      }),
    });

    expect(mockPrisma.userTenantRole.create).toHaveBeenCalledWith({
      data: { userId: "user-1", tenantId: "tenant-1", role: "ADMIN" },
    });
    expect(mockPrisma.userOrgRole.create).toHaveBeenCalledWith({
      data: { userId: "user-1", orgId: "org-1", role: "ORG_ADMIN" },
    });
  });

  it("rejects signup when an account already exists for the email", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({ id: "existing-user" });

    await expect(
      service.signup({ email: "sarah@example.com", password: "a-secure-password" }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(auth0Mock.createUser).not.toHaveBeenCalled();
    expect(mockPrisma.org.create).not.toHaveBeenCalled();
  });

  it("fails loudly when Auth0 user creation fails, without creating any org", async () => {
    auth0Mock.createUser.mockResolvedValueOnce(null);

    await expect(
      service.signup({ email: "sarah@example.com", password: "a-secure-password" }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(mockPrisma.org.create).not.toHaveBeenCalled();
  });

  it("retries slug generation on a collision", async () => {
    mockPrisma.org.findUnique
      .mockResolvedValueOnce({ id: "clash" })
      .mockResolvedValueOnce(null);

    await service.signup({ email: "sarah@example.com", password: "a-secure-password" });

    expect(mockPrisma.org.findUnique).toHaveBeenCalledTimes(2);
  });
});
