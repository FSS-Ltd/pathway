import { ConflictException, ForbiddenException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { prisma } from "@pathway/db";
import { NexstepsHomeSignupService } from "../nexsteps-home-signup.service";
import { ClerkManagementService } from "../../auth/clerk-management.service";
import type { VerifiedPrincipal } from "../../auth/token-verifier";

jest.mock("@pathway/db", () => {
  const { OrgRole, Role } = jest.requireActual("@prisma/client");
  return {
    OrgRole,
    Role,
    prisma: {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
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
        findUnique: jest.fn(),
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
  const clerkMock = { setExternalId: jest.fn() };
  const mockPrisma = prisma as unknown as {
    user: { findUnique: jest.Mock; create: jest.Mock; update: jest.Mock };
    org: { create: jest.Mock; findUnique: jest.Mock };
    tenant: { create: jest.Mock };
    orgVertical: { create: jest.Mock };
    userIdentity: { findUnique: jest.Mock; create: jest.Mock };
    userTenantRole: { create: jest.Mock };
    userOrgRole: { create: jest.Mock };
    orgMembership: { create: jest.Mock };
    siteMembership: { create: jest.Mock };
  };

  const principal: VerifiedPrincipal = {
    provider: "clerk",
    sub: "clerk|new-user",
    email: "Sarah@Example.com",
    emailVerified: true,
  };

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        NexstepsHomeSignupService,
        { provide: ClerkManagementService, useValue: clerkMock },
      ],
    }).compile();

    service = moduleRef.get(NexstepsHomeSignupService);
    jest.clearAllMocks();

    mockPrisma.userIdentity.findUnique.mockResolvedValue(null);
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.org.findUnique.mockResolvedValue(null);
    mockPrisma.org.create.mockResolvedValue({ id: "org-1", slug: "sarah-family-abc123" });
    mockPrisma.tenant.create.mockResolvedValue({ id: "tenant-1", orgId: "org-1" });
    mockPrisma.orgVertical.create.mockResolvedValue({ id: "ov-1" });
    mockPrisma.user.create.mockResolvedValue({ id: "user-1" });
    mockPrisma.userIdentity.create.mockResolvedValue({ id: "identity-1" });
    mockPrisma.userTenantRole.create.mockResolvedValue({ id: "utr-1" });
    mockPrisma.userOrgRole.create.mockResolvedValue({ id: "uor-1" });
    mockPrisma.orgMembership.create.mockResolvedValue({ id: "om-1" });
    mockPrisma.siteMembership.create.mockResolvedValue({ id: "sm-1" });
  });

  it("creates the org, tenant and roles for a new household from a verified principal", async () => {
    const result = await service.signup(principal);

    expect(result).toEqual({ success: true, orgId: "org-1", tenantId: "tenant-1" });

    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: "sarah@example.com" },
    });

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
        provider: "clerk",
        providerSubject: "clerk|new-user",
      }),
    });

    expect(mockPrisma.userTenantRole.create).toHaveBeenCalledWith({
      data: { userId: "user-1", tenantId: "tenant-1", role: "ADMIN" },
    });
    expect(mockPrisma.userOrgRole.create).toHaveBeenCalledWith({
      data: { userId: "user-1", orgId: "org-1", role: "ORG_ADMIN" },
    });

    expect(clerkMock.setExternalId).toHaveBeenCalledWith("clerk|new-user", "user-1");
  });

  it("rejects an unverified email", async () => {
    await expect(
      service.signup({ ...principal, emailVerified: false }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(mockPrisma.org.create).not.toHaveBeenCalled();
  });

  it("rejects signup when a different user already owns the email", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({ id: "existing-user" });

    await expect(service.signup(principal)).rejects.toBeInstanceOf(ConflictException);

    expect(mockPrisma.org.create).not.toHaveBeenCalled();
  });

  it("is idempotent: a retry for an already-provisioned identity returns the existing household", async () => {
    mockPrisma.userIdentity.findUnique.mockResolvedValueOnce({
      id: "identity-1",
      user: { tenant: { id: "tenant-1", orgId: "org-1" } },
    });

    const result = await service.signup(principal);

    expect(result).toEqual({ success: true, orgId: "org-1", tenantId: "tenant-1" });
    expect(mockPrisma.org.create).not.toHaveBeenCalled();
  });

  it("adopts a bare, JIT-provisioned user for the same Clerk identity instead of erroring", async () => {
    mockPrisma.userIdentity.findUnique.mockResolvedValueOnce({
      id: "identity-1",
      userId: "jit-user-1",
      user: { tenant: null },
    });
    mockPrisma.user.update.mockResolvedValue({ id: "jit-user-1" });
    // The bare JIT user already owns this email - findUnique-by-email
    // must not be consulted (and must not be treated as a conflict) once
    // an identity match is found.
    mockPrisma.user.findUnique.mockResolvedValue({ id: "jit-user-1" });

    const result = await service.signup(principal);

    expect(result).toEqual({ success: true, orgId: "org-1", tenantId: "tenant-1" });
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: "jit-user-1" },
      data: expect.objectContaining({ tenantId: "tenant-1" }),
    });
    expect(mockPrisma.user.create).not.toHaveBeenCalled();
    expect(mockPrisma.userIdentity.create).not.toHaveBeenCalled();
    expect(clerkMock.setExternalId).toHaveBeenCalledWith("clerk|new-user", "jit-user-1");
  });

  it("retries slug generation on a collision", async () => {
    mockPrisma.org.findUnique
      .mockResolvedValueOnce({ id: "clash" })
      .mockResolvedValueOnce(null);

    await service.signup(principal);

    expect(mockPrisma.org.findUnique).toHaveBeenCalledTimes(2);
  });
});
