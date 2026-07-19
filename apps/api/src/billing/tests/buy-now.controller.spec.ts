import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { BuyNowController } from "../buy-now.controller";
import { BuyNowService } from "../buy-now.service";
import { AuthUserGuard } from "../../auth/auth-user.guard";
import type { BuyNowCheckoutResponse } from "../buy-now.types";

describe("BuyNowController", () => {
  let app: INestApplication;
  const serviceMock = {
    checkout: jest.fn(),
  };

  const baseBody = {
    plan: { planCode: "STARTER_MONTHLY", av30AddonBlocks: 1 },
    org: {
      orgName: "Test Org",
      contactName: "Jane Doe",
      contactEmail: "jane@example.com",
      password: "TestPassword123!",
      sector: "CHURCH",
    },
    successUrl: "https://example.com/success",
    cancelUrl: "https://example.com/cancel",
  };

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [BuyNowController],
      providers: [{ provide: BuyNowService, useValue: serviceMock }],
    })
      .overrideGuard(AuthUserGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidUnknownValues: true }),
    );
    await app.init();
    serviceMock.checkout.mockReset();
  });

  afterEach(async () => {
    await app.close();
  });

  it("accepts valid payload and delegates to service", async () => {
    const mockResponse: BuyNowCheckoutResponse = {
      preview: {
        planCode: "STARTER_MONTHLY",
        planTier: "starter",
        billingPeriod: "monthly",
        av30Cap: 75,
        maxChildren: null,
        maxSites: 1,
        storageGbCap: null,
        smsMessagesCap: null,
        leaderSeatsIncluded: null,
        source: "plan_catalogue",
      },
      provider: "fake",
      sessionId: "fake_123",
      sessionUrl: "https://example.test/checkout/fake_123",
      warnings: ["price_not_included"],
    };
    serviceMock.checkout.mockResolvedValue(mockResponse);

    const res = await request(app.getHttpServer())
      .post("/billing/buy-now/checkout")
      .send(baseBody)
      .expect(201);

    expect(serviceMock.checkout).toHaveBeenCalledWith(baseBody);
    expect(res.body.sessionId).toBe("fake_123");
  });

  it("rejects invalid email with 400", async () => {
    const badBody = {
      ...baseBody,
      org: { ...baseBody.org, contactEmail: "not-an-email" },
    };

    await request(app.getHttpServer())
      .post("/billing/buy-now/checkout")
      .send(badBody)
      .expect(400);

    expect(serviceMock.checkout).not.toHaveBeenCalled();
  });

  it("rejects duplicate or unknown module selections with 400", async () => {
    await request(app.getHttpServer())
      .post("/billing/buy-now/checkout")
      .send({
        ...baseBody,
        plan: {
          ...baseBody.plan,
          selectedModules: ["FINANCE", "FINANCE", "NOT_A_MODULE"],
        },
      })
      .expect(400);

    expect(serviceMock.checkout).not.toHaveBeenCalled();
  });
});
