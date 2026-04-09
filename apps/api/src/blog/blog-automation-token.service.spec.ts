import {
  HttpException,
  HttpStatus,
  UnauthorizedException,
} from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { prisma } from "@pathway/db";
import { BlogAutomationTokenService } from "./blog-automation-token.service";

jest.mock("@pathway/db", () => ({
  prisma: {
    automationApiToken: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    automationBlogPublishAudit: {
      create: jest.fn(),
    },
  },
}));

describe("BlogAutomationTokenService", () => {
  let service: BlogAutomationTokenService;
  const prismaAutomation = prisma as unknown as {
    automationApiToken: {
      findFirst: jest.Mock;
      update: jest.Mock;
    };
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BlogAutomationTokenService],
    }).compile();

    service = module.get<BlogAutomationTokenService>(BlogAutomationTokenService);
    jest.clearAllMocks();
  });

  it("authenticates active token and updates lastUsedAt", async () => {
    prismaAutomation.automationApiToken.findFirst.mockResolvedValue({
      id: "tok_1",
      name: "claude-cowork",
    });
    prismaAutomation.automationApiToken.update.mockResolvedValue({ id: "tok_1" });

    const token = await service.authenticate("raw-token");

    expect(token).toEqual({ id: "tok_1", name: "claude-cowork" });
    expect(prismaAutomation.automationApiToken.update).toHaveBeenCalledWith({
      where: { id: "tok_1" },
      data: { lastUsedAt: expect.any(Date) },
    });
  });

  it("rejects invalid tokens", async () => {
    prismaAutomation.automationApiToken.findFirst.mockResolvedValue(null);

    await expect(service.authenticate("bad-token")).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it("enforces per-token rate limits", () => {
    process.env.BLOG_AUTOMATION_RATE_LIMIT_PER_MINUTE = "1";
    const local = new BlogAutomationTokenService();

    local.assertWithinRateLimit("tok_1");

    try {
      local.assertWithinRateLimit("tok_1");
      throw new Error("Expected rate limit error");
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  });
});
