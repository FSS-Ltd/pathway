import { UnauthorizedException } from "@nestjs/common";
import { LeadKind } from "@prisma/client";
import { LeadsService } from "../leads.service";
import {
  createTeamTrackerLeadDto,
  createToolkitLeadDto,
} from "../dto/create-lead.dto";

const prismaMock = {
  lead: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  downloadToken: {
    create: jest.fn(),
    findFirst: jest.fn(),
  },
};

jest.mock("@pathway/db", () => {
  const actual = jest.requireActual("@pathway/db");
  return {
    ...actual,
    get prisma() {
      return prismaMock;
    },
  };
});

const mailerServiceMock = {
  sendToolkitLink: jest.fn().mockResolvedValue(undefined),
  sendTeamTrackerDelivery: jest.fn().mockResolvedValue("delivery_1"),
  scheduleTeamTrackerFollowUp: jest.fn().mockResolvedValue("scheduled_1"),
  cancelScheduledEmail: jest.fn().mockResolvedValue(undefined),
  sendDemoRequestEmail: jest.fn().mockResolvedValue(undefined),
};

describe("LeadsService", () => {
  let service: LeadsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new LeadsService(mailerServiceMock as never);
    process.env.SITE_URL = "https://example.com";
  });

  describe("createDemoLead", () => {
    it("notifies sales with the submitted form contents", async () => {
      prismaMock.lead.findFirst.mockResolvedValue(null);
      prismaMock.lead.create.mockResolvedValue({
        id: "lead_1",
        kind: LeadKind.DEMO,
        createdAt: new Date(),
      });

      await service.createDemoLead({
        name: "Alice",
        email: "Alice@Example.com",
        organisation: "Test Org",
        role: "Head",
        sector: "Education",
        message: "Interested in a demo",
      });

      expect(mailerServiceMock.sendDemoRequestEmail).toHaveBeenCalledWith({
        name: "Alice",
        email: "alice@example.com",
        organisation: "Test Org",
        role: "Head",
        sector: "Education",
        message: "Interested in a demo",
      });
    });
  });

  describe("createToolkitLead - validation", () => {
    it("createToolkitLeadDto rejects when consentMarketing is false", () => {
      const result = createToolkitLeadDto.safeParse({
        email: "test@example.com",
        consentMarketing: false,
      });
      expect(result.success).toBe(false);
    });

    it("createToolkitLeadDto rejects invalid email", () => {
      const result = createToolkitLeadDto.safeParse({
        email: "not-an-email",
        consentMarketing: true,
      });
      expect(result.success).toBe(false);
    });

    it("createToolkitLeadDto accepts valid payload with consentMarketing true", () => {
      const result = createToolkitLeadDto.safeParse({
        email: "test@example.com",
        name: "Alice",
        orgName: "Test Org",
        consentMarketing: true,
      });
      expect(result.success).toBe(true);
    });
  });

  describe("createToolkitLead - token hash", () => {
    it("creates a DownloadToken with hashed token (never stores raw)", async () => {
      prismaMock.lead.findFirst.mockResolvedValue(null);
      prismaMock.lead.create.mockResolvedValue({
        id: "lead_1",
        kind: LeadKind.TOOLKIT,
        createdAt: new Date(),
      });
      prismaMock.downloadToken.create.mockImplementation((args: { data: { tokenHash: string } }) => {
        const { tokenHash } = args.data;
        expect(tokenHash).toMatch(/^[a-f0-9]{64}$/);
        expect(tokenHash).not.toContain("raw");
        return Promise.resolve({ id: "tok_1" });
      });

      await service.createToolkitLead({
        email: "test@example.com",
        consentMarketing: true,
      });

      expect(prismaMock.downloadToken.create).toHaveBeenCalledTimes(1);
      const call = prismaMock.downloadToken.create.mock.calls[0][0];
      expect(call.data.tokenHash).toBeDefined();
      expect(call.data.tokenHash.length).toBe(64);
    });
  });

  describe("createTeamTrackerLead", () => {
    it("allows the free tracker to be delivered without marketing consent", async () => {
      prismaMock.lead.findFirst.mockResolvedValue(null);
      prismaMock.lead.create.mockResolvedValue({ id: "lead_1" });
      prismaMock.downloadToken.create.mockResolvedValue({ id: "token_1" });

      const result = await service.createTeamTrackerLead({
        name: "Alice",
        email: "Alice@Example.com",
        organisationType: "school",
        role: "leader",
        consentMarketing: false,
      });

      expect(result.downloadUrl).toMatch(/^https:\/\/example\.com\/api\/team-tracker\/download\?token=/);
      expect(mailerServiceMock.sendTeamTrackerDelivery).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "alice@example.com",
          name: "Alice",
          unsubscribeUrl: undefined,
        }),
      );
      expect(mailerServiceMock.scheduleTeamTrackerFollowUp).not.toHaveBeenCalled();
    });

    it("schedules the high-fit readiness invitation only for opted-in high-fit leads", async () => {
      prismaMock.lead.findFirst.mockResolvedValue(null);
      prismaMock.lead.create.mockResolvedValue({ id: "lead_1" });
      prismaMock.downloadToken.create.mockResolvedValue({ id: "token_1" });
      prismaMock.lead.update.mockResolvedValue({ id: "lead_1" });
      mailerServiceMock.scheduleTeamTrackerFollowUp
        .mockResolvedValueOnce("scheduled_day_3")
        .mockResolvedValueOnce("scheduled_day_7")
        .mockResolvedValueOnce("scheduled_day_12");

      await service.createTeamTrackerLead({
        name: "Alice",
        email: "alice@example.com",
        organisationType: "charity",
        role: "administrator",
        teamSize: "51+",
        currentTools: "multiple_tools",
        consentMarketing: true,
      });

      expect(mailerServiceMock.scheduleTeamTrackerFollowUp).toHaveBeenCalledTimes(3);
      expect(mailerServiceMock.scheduleTeamTrackerFollowUp).toHaveBeenLastCalledWith(
        expect.objectContaining({ kind: "day_12" }),
      );
    });
  });

  describe("createTeamTrackerLeadDto", () => {
    it("keeps marketing consent separate from the required download details", () => {
      const result = createTeamTrackerLeadDto.safeParse({
        name: "Alice",
        email: "alice@example.com",
        organisationType: "club",
        role: "leader",
        consentMarketing: false,
      });

      expect(result.success).toBe(true);
      expect(result.data?.consentMarketing).toBe(false);
    });
  });

  describe("redeemToolkitToken", () => {
    it("throws UnauthorizedException for invalid token", async () => {
      prismaMock.downloadToken.findFirst.mockResolvedValue(null);

      await expect(
        service.redeemToolkitToken("invalid-token-123"),
      ).rejects.toThrow(UnauthorizedException);
    });

    it("throws UnauthorizedException for expired token", async () => {
      prismaMock.downloadToken.findFirst.mockResolvedValue(null);

      await expect(
        service.redeemToolkitToken("some-token"),
      ).rejects.toThrow(UnauthorizedException);
    });

    it("returns orgName and name for valid token", async () => {
      prismaMock.downloadToken.findFirst.mockResolvedValue({
        id: "tok_1",
        leadId: "lead_1",
        lead: {
          organisation: "Test School",
          name: "Alice",
          downloadedAt: null,
        },
      });
      prismaMock.lead.update.mockResolvedValue({});

      const result = await service.redeemToolkitToken("valid-token");

      expect(result).toEqual({
        orgName: "Test School",
        name: "Alice",
      });
    });
  });
});
