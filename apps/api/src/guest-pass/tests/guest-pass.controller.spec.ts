import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException } from "@nestjs/common";
import request from "supertest";
import { AuthUserGuard } from "../../auth/auth-user.guard";
import { GuestPassController } from "../guest-pass.controller";
import { GuestPassPublicController } from "../guest-pass-public.controller";
import { GuestPassService } from "../guest-pass.service";

describe("GuestPassController", () => {
  const serviceMock = {
    createForStaff: jest.fn(),
    createForSelfServe: jest.fn(),
  };

  const validBody = {
    child: { firstName: "Guest", lastName: "Child" },
    guardian: { fullName: "Jane Visitor", phone: "07700900123" },
    consentConfirmed: true,
  };

  describe("POST /guest-pass/current (staff)", () => {
    let controller: GuestPassController;

    beforeEach(async () => {
      jest.clearAllMocks();
      const module: TestingModule = await Test.createTestingModule({
        controllers: [GuestPassController],
        providers: [{ provide: GuestPassService, useValue: serviceMock }],
      })
        .overrideGuard(AuthUserGuard)
        .useValue({ canActivate: () => true })
        .compile();
      controller = module.get<GuestPassController>(GuestPassController);
    });

    it("delegates to the service and returns the created guest pass", async () => {
      serviceMock.createForStaff.mockResolvedValue({
        childId: "child-1",
        guestExpiresAt: new Date("2025-01-02T00:00:00Z"),
      });

      const res = await controller.createForCurrentSite("tenant-1", validBody);

      expect(serviceMock.createForStaff).toHaveBeenCalledWith("tenant-1", validBody);
      expect(res.childId).toBe("child-1");
    });

    it("propagates BadRequestException from the service", async () => {
      serviceMock.createForStaff.mockRejectedValueOnce(
        new BadRequestException("Guardian consent must be confirmed"),
      );

      await expect(
        controller.createForCurrentSite("tenant-1", {
          ...validBody,
          consentConfirmed: false,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("POST /public/signup/submit-guest", () => {
    let app: Awaited<ReturnType<typeof createPublicApp>>;

    async function createPublicApp() {
      const moduleRef: TestingModule = await Test.createTestingModule({
        controllers: [GuestPassPublicController],
        providers: [{ provide: GuestPassService, useValue: serviceMock }],
      }).compile();
      const application = moduleRef.createNestApplication();
      await application.init();
      return application;
    }

    beforeEach(async () => {
      jest.clearAllMocks();
      app = await createPublicApp();
    });

    afterEach(async () => {
      await app.close();
    });

    it("delegates to the service for self-serve guest submission", async () => {
      serviceMock.createForSelfServe.mockResolvedValue({
        childId: "child-2",
        guestExpiresAt: new Date("2025-01-02T00:00:00Z"),
      });

      const res = await request(app.getHttpServer())
        .post("/public/signup/submit-guest")
        .send({
          token: "a".repeat(32),
          child: validBody.child,
          guardian: validBody.guardian,
          dataProcessingConsent: true,
        })
        .expect(201);

      expect(serviceMock.createForSelfServe).toHaveBeenCalled();
      expect(res.body.childId).toBe("child-2");
    });
  });
});
