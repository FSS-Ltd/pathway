import { ExecutionContext } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { PublicSignupController } from "../public-signup.controller";
import { PublicSignupService } from "../public-signup.service";
import { VerifiedPrincipalGuard } from "../../auth/verified-principal.guard";
import type { RequestWithVerifiedPrincipal } from "../../auth/verified-principal.guard";

const verifiedPrincipal = {
  provider: "clerk" as const,
  sub: "clerk|parent-1",
  email: "sarah@example.com",
  emailVerified: true,
};

describe("PublicSignupController", () => {
  let app: Awaited<ReturnType<typeof createApp>>;
  const serviceMock = {
    getConfig: jest.fn(),
    signupPreflight: jest.fn(),
    submit: jest.fn(),
    submitExistingUser: jest.fn(),
    submitContactOnly: jest.fn(),
  };

  async function createApp() {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [PublicSignupController],
      providers: [{ provide: PublicSignupService, useValue: serviceMock }],
    })
      .overrideGuard(VerifiedPrincipalGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const req = context.switchToHttp().getRequest<RequestWithVerifiedPrincipal>();
          req.verifiedPrincipal = verifiedPrincipal;
          return true;
        },
      })
      .compile();

    const application = moduleRef.createNestApplication();
    await application.init();
    return application;
  }

  beforeEach(async () => {
    app = await createApp();
    serviceMock.getConfig.mockReset();
    serviceMock.signupPreflight.mockReset();
    serviceMock.submit.mockReset();
    serviceMock.submitExistingUser.mockReset();
    serviceMock.submitContactOnly.mockReset();
  });

  afterEach(async () => {
    await app.close();
  });

  describe("GET /public/signup/config", () => {
    it("returns 400 when token is missing", async () => {
      await request(app.getHttpServer())
        .get("/public/signup/config")
        .expect(400);
      expect(serviceMock.getConfig).not.toHaveBeenCalled();
    });

    it("delegates to service and returns config when token provided", async () => {
      const config = {
        orgName: "Test Org",
        siteName: "Test Site",
        siteTimezone: "Europe/London",
        requiredConsents: ["data_processing"],
        formVersion: "1.0",
      };
      serviceMock.getConfig.mockResolvedValue(config);

      const res = await request(app.getHttpServer())
        .get("/public/signup/config?token=abc123token")
        .expect(200);

      expect(serviceMock.getConfig).toHaveBeenCalledWith("abc123token");
      expect(res.body).toEqual(config);
    });
  });

  describe("POST /public/signup/preflight", () => {
    it("returns EXISTING_USER when email exists", async () => {
      serviceMock.signupPreflight.mockResolvedValue({
        email: "existing@example.com",
        userExists: true,
        mode: "EXISTING_USER",
      });

      const res = await request(app.getHttpServer())
        .post("/public/signup/preflight")
        .send({
          inviteToken: "a".repeat(32),
          email: "existing@example.com",
        })
        .expect(201);

      expect(res.body.mode).toBe("EXISTING_USER");
      expect(serviceMock.signupPreflight).toHaveBeenCalledWith(
        "a".repeat(32),
        "existing@example.com",
      );
    });

    it("returns NEW_USER when email does not exist", async () => {
      serviceMock.signupPreflight.mockResolvedValue({
        email: "new@example.com",
        userExists: false,
        mode: "NEW_USER",
      });

      const res = await request(app.getHttpServer())
        .post("/public/signup/preflight")
        .send({
          inviteToken: "a".repeat(32),
          email: "new@example.com",
        })
        .expect(201);

      expect(res.body.mode).toBe("NEW_USER");
    });
  });

  describe("POST /public/signup/submit", () => {
    const validBody = {
      token: "a".repeat(32),
      parent: { fullName: "Jane Doe", email: "jane@example.com" },
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

    it("accepts valid payload and returns success", async () => {
      serviceMock.submit.mockResolvedValue({
        success: true,
        message: "Check your email",
      });

      const res = await request(app.getHttpServer())
        .post("/public/signup/submit")
        .send(validBody)
        .expect(201);

      expect(serviceMock.submit).toHaveBeenCalledWith(validBody);
      expect(res.body.success).toBe(true);
    });

    it("returns 400 when service throws BadRequestException", async () => {
      const body = { ...validBody, consents: { dataProcessingConsent: false } };
      const { BadRequestException } = await import("@nestjs/common");
      serviceMock.submit.mockRejectedValueOnce(new BadRequestException("Data processing consent is required"));

      await request(app.getHttpServer())
        .post("/public/signup/submit")
        .send(body)
        .expect(400);
    });
  });

  describe("POST /public/signup/submit-contact-only", () => {
    const validBody = {
      token: "a".repeat(32),
      parent: {
        fullName: "Jane Doe",
        email: "jane@example.com",
        phone: "07700900111",
        relationshipToChild: "Parent",
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

    it("delegates to contact-only signup service", async () => {
      serviceMock.submitContactOnly.mockResolvedValue({
        success: true,
        message: "Registration complete",
      });

      const res = await request(app.getHttpServer())
        .post("/public/signup/submit-contact-only")
        .send(validBody)
        .expect(201);

      expect(serviceMock.submitContactOnly).toHaveBeenCalledWith(validBody);
      expect(res.body.success).toBe(true);
    });
  });

  describe("POST /public/signup/submit-existing-user", () => {
    const validBody = {
      token: "a".repeat(32),
      parent: {
        fullName: "Sarah Doe",
        email: "sarah@example.com",
        relationshipToChild: "Parent",
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

    it("delegates to the service with the body and the verified principal - no password required", async () => {
      serviceMock.submitExistingUser.mockResolvedValue({
        success: true,
        message: "Registration complete.",
      });

      const res = await request(app.getHttpServer())
        .post("/public/signup/submit-existing-user")
        .send(validBody)
        .expect(201);

      expect(serviceMock.submitExistingUser).toHaveBeenCalledWith(validBody, verifiedPrincipal);
      expect(res.body.success).toBe(true);
    });

    it("returns 400 when the service reports no matching account", async () => {
      const { BadRequestException } = await import("@nestjs/common");
      serviceMock.submitExistingUser.mockRejectedValueOnce(
        new BadRequestException("Account not found. Please sign in via the app first, or use a different email."),
      );

      await request(app.getHttpServer())
        .post("/public/signup/submit-existing-user")
        .send(validBody)
        .expect(400);
    });
  });
});
