import { ConflictException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { NexstepsHomeSignupController } from "../nexsteps-home-signup.controller";
import { NexstepsHomeSignupService } from "../nexsteps-home-signup.service";

describe("NexstepsHomeSignupController", () => {
  let app: Awaited<ReturnType<typeof createApp>>;
  const serviceMock = { signup: jest.fn() };

  async function createApp() {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [NexstepsHomeSignupController],
      providers: [{ provide: NexstepsHomeSignupService, useValue: serviceMock }],
    }).compile();

    const application = moduleRef.createNestApplication();
    application.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
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
    it("delegates a valid signup to the service", async () => {
      serviceMock.signup.mockResolvedValue({
        success: true,
        orgId: "org-1",
        tenantId: "tenant-1",
      });

      const res = await request(app.getHttpServer())
        .post("/public/nexsteps-home/signup")
        .send({ email: "sarah@example.com", password: "a-secure-password" })
        .expect(201);

      expect(serviceMock.signup).toHaveBeenCalledWith({
        email: "sarah@example.com",
        password: "a-secure-password",
      });
      expect(res.body).toEqual({ success: true, orgId: "org-1", tenantId: "tenant-1" });
    });

    it("rejects an invalid email", async () => {
      await request(app.getHttpServer())
        .post("/public/nexsteps-home/signup")
        .send({ email: "not-an-email", password: "a-secure-password" })
        .expect(400);

      expect(serviceMock.signup).not.toHaveBeenCalled();
    });

    it("rejects a password under 12 characters", async () => {
      await request(app.getHttpServer())
        .post("/public/nexsteps-home/signup")
        .send({ email: "sarah@example.com", password: "short" })
        .expect(400);

      expect(serviceMock.signup).not.toHaveBeenCalled();
    });

    it("rejects unknown fields", async () => {
      await request(app.getHttpServer())
        .post("/public/nexsteps-home/signup")
        .send({
          email: "sarah@example.com",
          password: "a-secure-password",
          isSuite: true,
        })
        .expect(400);

      expect(serviceMock.signup).not.toHaveBeenCalled();
    });

    it("returns 409 when the service reports a conflict", async () => {
      serviceMock.signup.mockRejectedValueOnce(
        new ConflictException("An account already exists for this email address."),
      );

      await request(app.getHttpServer())
        .post("/public/nexsteps-home/signup")
        .send({ email: "sarah@example.com", password: "a-secure-password" })
        .expect(409);
    });
  });
});
