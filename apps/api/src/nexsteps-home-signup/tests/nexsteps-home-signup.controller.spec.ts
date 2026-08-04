import { ConflictException } from "@nestjs/common";
import { ExecutionContext } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { NexstepsHomeSignupController } from "../nexsteps-home-signup.controller";
import { NexstepsHomeSignupService } from "../nexsteps-home-signup.service";
import { VerifiedPrincipalGuard } from "../../auth/verified-principal.guard";
import type { RequestWithVerifiedPrincipal } from "../../auth/verified-principal.guard";

describe("NexstepsHomeSignupController", () => {
  let app: Awaited<ReturnType<typeof createApp>>;
  const serviceMock = { signup: jest.fn() };
  const principal = {
    provider: "clerk" as const,
    sub: "clerk|new-user",
    email: "sarah@example.com",
    emailVerified: true,
  };

  async function createApp() {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [NexstepsHomeSignupController],
      providers: [{ provide: NexstepsHomeSignupService, useValue: serviceMock }],
    })
      .overrideGuard(VerifiedPrincipalGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const req = context.switchToHttp().getRequest<RequestWithVerifiedPrincipal>();
          req.verifiedPrincipal = principal;
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
    serviceMock.signup.mockReset();
  });

  afterEach(async () => {
    await app.close();
  });

  describe("POST /public/nexsteps-home/signup", () => {
    it("delegates the verified principal to the service", async () => {
      serviceMock.signup.mockResolvedValue({
        success: true,
        orgId: "org-1",
        tenantId: "tenant-1",
      });

      const res = await request(app.getHttpServer())
        .post("/public/nexsteps-home/signup")
        .expect(201);

      expect(serviceMock.signup).toHaveBeenCalledWith(principal);
      expect(res.body).toEqual({ success: true, orgId: "org-1", tenantId: "tenant-1" });
    });

    it("returns 409 when the service reports a conflict", async () => {
      serviceMock.signup.mockRejectedValueOnce(
        new ConflictException("An account already exists for this email address."),
      );

      await request(app.getHttpServer())
        .post("/public/nexsteps-home/signup")
        .expect(409);
    });
  });
});
