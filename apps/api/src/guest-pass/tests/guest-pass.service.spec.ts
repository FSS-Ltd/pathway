import { BadRequestException } from "@nestjs/common";
import { prisma } from "@pathway/db";
import { GuestPassService, GUEST_PASS_DURATION_HOURS } from "../guest-pass.service";
import { PublicSignupService } from "../../public-signup/public-signup.service";

jest.mock("@pathway/db", () => {
  const { ChildGuardianContactType } = jest.requireActual("@prisma/client");
  return {
    ChildGuardianContactType,
    prisma: {
      child: { create: jest.fn() },
      childGuardianContact: { create: jest.fn() },
    },
  };
});

describe("GuestPassService", () => {
  let service: GuestPassService;
  const resolveLink = jest.fn();
  const publicSignupServiceMock = {
    resolveLink,
  } as unknown as PublicSignupService;

  const childInput = {
    firstName: "Guest",
    lastName: "Child",
    dateOfBirth: "2015-05-01",
    allergies: "Peanuts",
    additionalNeedsNotes: "None",
  };
  const guardianInput = {
    fullName: "Jane Visitor",
    phone: "07700900123",
    relationshipToChild: "Aunt",
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new GuestPassService(publicSignupServiceMock);
    (prisma.child.create as jest.Mock).mockResolvedValue({ id: "child-1" });
    (prisma.childGuardianContact.create as jest.Mock).mockResolvedValue({});
  });

  describe("createGuestChild", () => {
    it("creates a child flagged isGuest with a 24h expiry and a primary guardian contact", async () => {
      const before = Date.now();
      const result = await service.createGuestChild(
        "tenant-1",
        childInput,
        guardianInput,
      );
      const after = Date.now();

      expect(result.childId).toBe("child-1");
      const expectedMinMs = before + GUEST_PASS_DURATION_HOURS * 60 * 60 * 1000;
      const expectedMaxMs = after + GUEST_PASS_DURATION_HOURS * 60 * 60 * 1000;
      expect(result.guestExpiresAt.getTime()).toBeGreaterThanOrEqual(expectedMinMs);
      expect(result.guestExpiresAt.getTime()).toBeLessThanOrEqual(expectedMaxMs);

      expect(prisma.child.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: "tenant-1",
            firstName: "Guest",
            lastName: "Child",
            isGuest: true,
            guestExpiresAt: expect.any(Date),
          }),
        }),
      );
      expect(prisma.childGuardianContact.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          childId: "child-1",
          tenantId: "tenant-1",
          fullName: "Jane Visitor",
          phone: "07700900123",
          relationshipToChild: "Aunt",
          contactType: "PRIMARY_GUARDIAN",
          dataProcessingConsentAt: expect.any(Date),
        }),
      });
    });

    it("defaults allergies to unknown when not provided", async () => {
      await service.createGuestChild("tenant-1", { ...childInput, allergies: undefined }, guardianInput);
      expect(prisma.child.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ allergies: "unknown" }),
        }),
      );
    });
  });

  describe("createForStaff", () => {
    it("rejects when consent is not confirmed", async () => {
      await expect(
        service.createForStaff("tenant-1", {
          child: childInput,
          guardian: guardianInput,
          consentConfirmed: false,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.child.create).not.toHaveBeenCalled();
    });

    it("creates a guest child when consent is confirmed", async () => {
      const result = await service.createForStaff("tenant-1", {
        child: childInput,
        guardian: guardianInput,
        consentConfirmed: true,
      });
      expect(result.childId).toBe("child-1");
    });
  });

  describe("createForSelfServe", () => {
    it("rejects when data processing consent is false", async () => {
      await expect(
        service.createForSelfServe({
          token: "a".repeat(32),
          child: childInput,
          guardian: guardianInput,
          dataProcessingConsent: false,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(resolveLink).not.toHaveBeenCalled();
    });

    it("resolves the token and creates a guest child in that tenant", async () => {
      resolveLink.mockResolvedValue({
        id: "link-1",
        tenantId: "tenant-2",
        orgId: "org-1",
        orgName: "Test Org",
        siteName: "Test Site",
        siteTimezone: null,
        parentPortalEnabled: true,
      });

      const result = await service.createForSelfServe({
        token: "a".repeat(32),
        child: childInput,
        guardian: guardianInput,
        dataProcessingConsent: true,
      });

      expect(resolveLink).toHaveBeenCalledWith("a".repeat(32));
      expect(result.childId).toBe("child-1");
      expect(prisma.child.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tenantId: "tenant-2" }),
        }),
      );
    });
  });
});
