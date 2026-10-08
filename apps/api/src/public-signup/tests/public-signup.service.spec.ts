import { NotFoundException, BadRequestException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { prisma, withTenantRlsContext } from "@pathway/db";
import { PublicSignupService } from "../public-signup.service";
import { MailerService } from "../../mailer/mailer.service";
import { Auth0ManagementService } from "../../auth/auth0-management.service";
import { AuthIdentityService } from "../../auth/auth-identity.service";
import type { VerifiedPrincipal } from "../../auth/token-verifier";

jest.mock("@pathway/db", () => {
  const { ChildGuardianContactType, Role } = jest.requireActual("@prisma/client");
  return {
    ChildGuardianContactType,
    Role,
    prisma: {
      publicSignupLink: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      user: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      userIdentity: {
        create: jest.fn(),
      },
      userTenantRole: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      child: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      childGuardianContact: {
        createMany: jest.fn(),
      },
      guardianIdentity: {
        upsert: jest.fn(),
      },
      guardianChildRelationship: {
        createMany: jest.fn(),
      },
      emergencyContact: {
        createMany: jest.fn(),
      },
    parentSignupConsent: {
      create: jest.fn(),
    },
    $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) => {
      const p = jest.requireMock("@pathway/db").prisma;
      return fn(p);
    }),
  },
    withTenantRlsContext: jest.fn(
      (
        _tenantId: string,
        _orgId: string,
        fn: (tx: unknown) => Promise<unknown>,
      ) => {
        const p = jest.requireMock("@pathway/db").prisma;
        return fn(p);
      },
    ),
  };
});

describe("PublicSignupService", () => {
  let service: PublicSignupService;
  const mailerMock = { sendParentSignupCompleteEmail: jest.fn() };
  const auth0Mock = { createUser: jest.fn() };
  const authIdentityMock = { findExistingUserByPrincipal: jest.fn() };

  const validLink = {
    id: "link-1",
    tenantId: "tenant-1",
    orgId: "org-1",
    org: { name: "Test Org", parentPortalEnabled: true },
    tenant: { name: "Test Site", timezone: "Europe/London" },
  };
  const portalDisabledLink = {
    ...validLink,
    org: { ...validLink.org, parentPortalEnabled: false },
  };

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        PublicSignupService,
        { provide: MailerService, useValue: mailerMock },
        { provide: Auth0ManagementService, useValue: auth0Mock },
        { provide: AuthIdentityService, useValue: authIdentityMock },
      ],
    }).compile();

    service = moduleRef.get(PublicSignupService);
    jest.clearAllMocks();
    (prisma.guardianIdentity.upsert as jest.Mock).mockResolvedValue({
      id: "guardian-1",
    });
    mailerMock.sendParentSignupCompleteEmail.mockResolvedValue(undefined);
    auth0Mock.createUser.mockResolvedValue("auth0|123");
  });

  describe("signupPreflight", () => {
    it("returns NEW_USER when email does not exist", async () => {
      (prisma.publicSignupLink.findFirst as jest.Mock).mockResolvedValue(validLink);
      (prisma.user.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await service.signupPreflight("a".repeat(32), "new@example.com");

      expect(result).toEqual({
        email: "new@example.com",
        userExists: false,
        mode: "NEW_USER",
      });
    });

    it("returns EXISTING_USER when email exists", async () => {
      (prisma.publicSignupLink.findFirst as jest.Mock).mockResolvedValue(validLink);
      (prisma.user.findFirst as jest.Mock).mockResolvedValue({
        id: "user-1",
        email: "existing@example.com",
        name: "Jane Doe",
        displayName: "Jane Doe",
      });

      const result = await service.signupPreflight("a".repeat(32), "Existing@Example.com");

      expect(result).toMatchObject({
        email: "existing@example.com",
        userExists: true,
        mode: "EXISTING_USER",
        displayName: "Jane Doe",
      });
    });

    it("throws when token is invalid", async () => {
      (prisma.publicSignupLink.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        service.signupPreflight("invalid", "any@example.com"),
      ).rejects.toThrow(NotFoundException);
    });

    it("does not expose existing-user status when parent portal is disabled", async () => {
      (prisma.publicSignupLink.findFirst as jest.Mock).mockResolvedValue(
        portalDisabledLink,
      );

      await expect(
        service.signupPreflight("a".repeat(32), "existing@example.com"),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.user.findFirst).not.toHaveBeenCalled();
    });
  });

  describe("linkChildrenExistingUser", () => {
    it("rejects attempts to claim existing children from a signup link", async () => {
      (prisma.publicSignupLink.findFirst as jest.Mock).mockResolvedValue(validLink);
      await expect(
        service.linkChildrenExistingUser("user-1", "a".repeat(32), ["child-1"]),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.child.findMany).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(prisma.guardianIdentity.upsert).not.toHaveBeenCalled();
    });

    it("sets family access without a child relationship when no child is supplied", async () => {
      (prisma.publicSignupLink.findFirst as jest.Mock).mockResolvedValue(validLink);
      (prisma.user.update as jest.Mock).mockResolvedValue({});
      (prisma.userTenantRole.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.userTenantRole.create as jest.Mock).mockResolvedValue({});

      await expect(
        service.linkChildrenExistingUser("user-1", "a".repeat(32), []),
      ).resolves.toEqual({ success: true, linkedCount: 0 });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: { tenantId: "tenant-1", hasFamilyAccess: true },
      });
      expect(prisma.guardianIdentity.upsert).not.toHaveBeenCalled();
    });

    it("creates children with internal profile pictures without organisation photo consent", async () => {
      (prisma.publicSignupLink.findFirst as jest.Mock).mockResolvedValue(validLink);
      (prisma.child.create as jest.Mock).mockResolvedValue({ id: "child-1" });
      (prisma.child.findMany as jest.Mock).mockResolvedValue([{ id: "child-1" }]);
      (prisma.user.update as jest.Mock).mockResolvedValue({});
      (prisma.userTenantRole.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.userTenantRole.create as jest.Mock).mockResolvedValue({});
      (prisma.$transaction as jest.Mock).mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
        fn(prisma),
      );

      const result = await service.linkChildrenExistingUser(
        "user-1",
        "a".repeat(32),
        [],
        [
          {
            firstName: "Child",
            lastName: "One",
            photoConsent: false,
            photoBase64: Buffer.from("fake-image-data").toString("base64"),
            photoContentType: "image/jpeg",
          },
        ],
      );

      expect(result).toEqual({ success: true, linkedCount: 1 });
      expect(prisma.child.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            photoConsent: false,
            photoBytes: expect.any(Buffer),
            photoContentType: "image/jpeg",
          }),
        }),
      );
      expect(prisma.guardianChildRelationship.createMany).toHaveBeenCalledWith({
        data: [
          {
            tenantId: "tenant-1",
            guardianIdentityId: "guardian-1",
            childId: "child-1",
            legalAccess: "FULL",
          },
        ],
      });
      expect(withTenantRlsContext).toHaveBeenCalledWith(
        "tenant-1",
        "org-1",
        expect.any(Function),
      );
    });
  });

  describe("resolveLink / getConfig", () => {
    it("throws NotFound when token is invalid", async () => {
      (prisma.publicSignupLink.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(service.getConfig("invalid-token")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("returns config when link is valid", async () => {
      (prisma.publicSignupLink.findFirst as jest.Mock).mockResolvedValue(
        validLink,
      );

      const config = await service.getConfig("any-token");

      expect(config).toMatchObject({
        orgName: "Test Org",
        siteName: "Test Site",
        siteTimezone: "Europe/London",
        parentPortalEnabled: true,
        formVersion: "1.0",
      });
      expect(config.requiredConsents).toContain("data_processing");
    });

    it("returns disabled parent portal config when org has disabled it", async () => {
      (prisma.publicSignupLink.findFirst as jest.Mock).mockResolvedValue(
        portalDisabledLink,
      );

      const config = await service.getConfig("any-token");

      expect(config).toMatchObject({
        orgName: "Test Org",
        siteName: "Test Site",
        parentPortalEnabled: false,
      });
    });
  });

  describe("submit", () => {
    const validDto = {
      token: "a".repeat(32),
      parent: {
        fullName: "Jane Doe",
        email: "jane@example.com",
        password: "SecurePass1",
      },
      emergencyContacts: [
        { name: "Emergency Contact", phone: "07700900123" },
      ],
      children: [
        {
          firstName: "Child",
          lastName: "One",
          photoConsent: false,
        },
      ],
      consents: { dataProcessingConsent: true },
    };

    it("throws when data processing consent is false", async () => {
      (prisma.publicSignupLink.findFirst as jest.Mock).mockResolvedValue(
        validLink,
      );

      await expect(
        service.submit({
          ...validDto,
          consents: { dataProcessingConsent: false },
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("throws when no emergency contacts", async () => {
      (prisma.publicSignupLink.findFirst as jest.Mock).mockResolvedValue(
        validLink,
      );

      await expect(
        service.submit({
          ...validDto,
          emergencyContacts: [],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("creates user, children, consents and returns success", async () => {
      (prisma.publicSignupLink.findFirst as jest.Mock).mockResolvedValue(
        validLink,
      );
      (prisma.user.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.user.create as jest.Mock).mockResolvedValue({
        id: "user-1",
        email: "jane@example.com",
        name: "Jane Doe",
      });
      (prisma.userIdentity.create as jest.Mock).mockResolvedValue({});
      (prisma.userTenantRole.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.userTenantRole.create as jest.Mock).mockResolvedValue({});
      (prisma.child.create as jest.Mock).mockResolvedValue({ id: "child-1" });
      (prisma.emergencyContact.createMany as jest.Mock).mockResolvedValue({});
      (prisma.parentSignupConsent.create as jest.Mock).mockResolvedValue({});
      (prisma.publicSignupLink.update as jest.Mock).mockResolvedValue({});

      const result = await service.submit(validDto);

      expect(result.success).toBe(true);
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: "jane@example.com",
            name: "Jane Doe",
            displayName: "Jane Doe",
            tenantId: "tenant-1",
            hasFamilyAccess: true,
          }),
        }),
      );
      expect(prisma.child.create).toHaveBeenCalled();
      expect(prisma.emergencyContact.createMany).toHaveBeenCalled();
      expect(prisma.parentSignupConsent.create).toHaveBeenCalled();
      expect(prisma.guardianIdentity.upsert).toHaveBeenCalledWith({
        where: { tenantId_userId: { tenantId: "tenant-1", userId: "user-1" } },
        create: { tenantId: "tenant-1", userId: "user-1" },
        update: {},
        select: { id: true },
      });
      expect(prisma.guardianChildRelationship.createMany).toHaveBeenCalledWith({
        data: [
          {
            tenantId: "tenant-1",
            guardianIdentityId: "guardian-1",
            childId: "child-1",
            legalAccess: "FULL",
          },
        ],
      });
    });

    it("does not attach a new child to an existing account by email alone", async () => {
      (prisma.publicSignupLink.findFirst as jest.Mock).mockResolvedValue(validLink);
      (prisma.user.findFirst as jest.Mock).mockResolvedValue({ id: "existing-user" });

      await expect(service.submit(validDto)).rejects.toThrow(BadRequestException);
      expect(prisma.child.create).not.toHaveBeenCalled();
      expect(prisma.guardianIdentity.upsert).not.toHaveBeenCalled();
    });

    it("does not grant guardian access when consent cannot be recorded", async () => {
      (prisma.publicSignupLink.findFirst as jest.Mock).mockResolvedValue(validLink);
      (prisma.user.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.user.create as jest.Mock).mockResolvedValue({ id: "user-1" });
      (prisma.userTenantRole.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.child.create as jest.Mock).mockResolvedValue({ id: "child-1" });
      (prisma.parentSignupConsent.create as jest.Mock).mockRejectedValue(
        new Error("Consent write failed"),
      );

      await expect(service.submit(validDto)).rejects.toThrow("Consent write failed");
      expect(prisma.guardianIdentity.upsert).not.toHaveBeenCalled();
    });

    it("accepts an internal child profile picture without organisation photo consent", async () => {
      (prisma.publicSignupLink.findFirst as jest.Mock).mockResolvedValue(
        validLink,
      );
      (prisma.user.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.user.create as jest.Mock).mockResolvedValue({
        id: "user-1",
        email: "jane@example.com",
        name: "Jane Doe",
      });
      (prisma.userIdentity.create as jest.Mock).mockResolvedValue({});
      (prisma.userTenantRole.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.userTenantRole.create as jest.Mock).mockResolvedValue({});
      (prisma.child.create as jest.Mock).mockResolvedValue({ id: "child-1" });
      (prisma.emergencyContact.createMany as jest.Mock).mockResolvedValue({});
      (prisma.parentSignupConsent.create as jest.Mock).mockResolvedValue({});
      (prisma.publicSignupLink.update as jest.Mock).mockResolvedValue({});

      const result = await service.submit({
        ...validDto,
        children: [
          {
            ...validDto.children[0],
            photoConsent: false,
            photoBase64: Buffer.from("fake-image-data").toString("base64"),
            photoContentType: "image/jpeg",
          },
        ],
      });

      expect(result.success).toBe(true);
      expect(prisma.child.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            photoConsent: false,
            photoBytes: expect.any(Buffer),
            photoContentType: "image/jpeg",
          }),
        }),
      );
    });

    it("rejects portal account submission when parent portal is disabled", async () => {
      (prisma.publicSignupLink.findFirst as jest.Mock).mockResolvedValue(
        portalDisabledLink,
      );

      await expect(service.submit(validDto)).rejects.toThrow(
        BadRequestException,
      );

      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(auth0Mock.createUser).not.toHaveBeenCalled();
    });

    it("rejects contact-only submission while parent portal is enabled", async () => {
      (prisma.publicSignupLink.findFirst as jest.Mock).mockResolvedValue(
        validLink,
      );

      await expect(service.submitContactOnly(validDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("stores contact-only child guardian records without creating portal access", async () => {
      (prisma.publicSignupLink.findFirst as jest.Mock).mockResolvedValue(
        portalDisabledLink,
      );
      (prisma.child.create as jest.Mock).mockResolvedValue({ id: "child-1" });
      (
        (prisma as unknown as {
          childGuardianContact: { createMany: jest.Mock };
        }).childGuardianContact.createMany
      ).mockResolvedValue({ count: 2 });
      (prisma.publicSignupLink.update as jest.Mock).mockResolvedValue({});

      const result = await service.submitContactOnly({
        ...validDto,
        parent: {
          fullName: "Jane Doe",
          email: "jane@example.com",
          phone: "07700900111",
          relationshipToChild: "Parent",
        },
        emergencyContacts: [
          {
            name: "Emergency Contact",
            phone: "07700900123",
            relationship: "Aunt",
          },
        ],
      });

      expect(result.success).toBe(true);
      expect(prisma.user.findFirst).not.toHaveBeenCalled();
      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(prisma.userTenantRole.create).not.toHaveBeenCalled();
      expect(prisma.guardianIdentity.upsert).not.toHaveBeenCalled();
      expect(auth0Mock.createUser).not.toHaveBeenCalled();
      expect(mailerMock.sendParentSignupCompleteEmail).not.toHaveBeenCalled();
      expect(
        (prisma as unknown as {
          childGuardianContact: { createMany: jest.Mock };
        }).childGuardianContact.createMany,
      ).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            childId: "child-1",
            tenantId: "tenant-1",
            fullName: "Jane Doe",
            email: "jane@example.com",
            phone: "07700900111",
            relationshipToChild: "Parent",
            contactType: "PRIMARY_GUARDIAN",
            dataProcessingConsentAt: expect.any(Date),
          }),
          expect.objectContaining({
            childId: "child-1",
            tenantId: "tenant-1",
            fullName: "Emergency Contact",
            email: null,
            phone: "07700900123",
            relationshipToChild: "Aunt",
            contactType: "EMERGENCY_CONTACT",
          }),
        ]),
      });
    });
  });

  describe("submitExistingUser", () => {
    const principal: VerifiedPrincipal = {
      provider: "clerk",
      sub: "clerk|parent-1",
      email: "sarah@example.com",
      emailVerified: true,
    };

    const validDto = {
      token: "a".repeat(32),
      parent: {
        fullName: "Sarah Doe",
        email: "sarah@example.com",
      },
      emergencyContacts: [{ name: "Emergency Contact", phone: "07700900123" }],
      children: [
        {
          firstName: "Child",
          lastName: "One",
          photoConsent: false,
        },
      ],
      consents: { dataProcessingConsent: true },
    };

    it("rejects an unverified principal without consulting the database", async () => {
      await expect(
        service.submitExistingUser(validDto, { ...principal, emailVerified: false }),
      ).rejects.toThrow(BadRequestException);

      expect(authIdentityMock.findExistingUserByPrincipal).not.toHaveBeenCalled();
    });

    it("rejects when no existing user resolves from the principal", async () => {
      (prisma.publicSignupLink.findFirst as jest.Mock).mockResolvedValue(validLink);
      authIdentityMock.findExistingUserByPrincipal.mockResolvedValue(null);

      await expect(service.submitExistingUser(validDto, principal)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("links children and completes signup for the resolved user - no password anywhere", async () => {
      (prisma.publicSignupLink.findFirst as jest.Mock).mockResolvedValue(validLink);
      authIdentityMock.findExistingUserByPrincipal.mockResolvedValue({
        id: "user-1",
        email: "sarah@example.com",
        name: null,
        displayName: null,
      });
      (prisma.user.update as jest.Mock).mockResolvedValue({});
      (prisma.userTenantRole.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.userTenantRole.create as jest.Mock).mockResolvedValue({});
      (prisma.child.create as jest.Mock).mockResolvedValue({ id: "child-1" });
      (prisma.emergencyContact.createMany as jest.Mock).mockResolvedValue({});
      (prisma.parentSignupConsent.create as jest.Mock).mockResolvedValue({});
      (prisma.publicSignupLink.update as jest.Mock).mockResolvedValue({});

      const result = await service.submitExistingUser(validDto, principal);

      expect(result.success).toBe(true);
      expect(authIdentityMock.findExistingUserByPrincipal).toHaveBeenCalledWith(principal);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: expect.objectContaining({ tenantId: "tenant-1", hasFamilyAccess: true }),
      });
      expect(prisma.child.create).toHaveBeenCalled();
      expect(auth0Mock.createUser).not.toHaveBeenCalled();
      expect(prisma.guardianChildRelationship.createMany).toHaveBeenCalledWith({
        data: [
          {
            tenantId: "tenant-1",
            guardianIdentityId: "guardian-1",
            childId: "child-1",
            legalAccess: "FULL",
          },
        ],
      });
    });
  });
});
