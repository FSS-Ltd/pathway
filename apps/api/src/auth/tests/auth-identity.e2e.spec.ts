import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { prisma } from "@pathway/db";
import { randomUUID } from "node:crypto";
import { AppModule } from "../../app.module";
import { AuthIdentityService } from "../auth-identity.service";
import { requireDatabase } from "../../../test-helpers.e2e";

describe("Auth identity provisioning (e2e)", () => {
  const subject = `auth0|uninvited-${randomUUID()}`;
  const email = `uninvited-${randomUUID()}@example.test`;
  let app: INestApplication | undefined;
  let userId: string | undefined;

  beforeAll(async () => {
    if (!requireDatabase()) return;

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (userId) {
      await prisma.userIdentity.deleteMany({ where: { userId } });
      await prisma.siteMembership.deleteMany({ where: { userId } });
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    await app?.close();
  });

  it("does not grant site access to an uninvited identity", async () => {
    if (!app) return;

    const service = app.get(AuthIdentityService);
    const result = await service.upsertFromAuth0({
      provider: "auth0",
      subject,
      email,
      name: "Uninvited User",
    });
    userId = result.userId;

    const membership = await prisma.siteMembership.findFirst({
      where: { userId },
    });

    expect(membership).toBeNull();
  });
});
