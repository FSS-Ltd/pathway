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
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    if (!requireDatabase()) return;

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (userId) createdUserIds.push(userId);
    for (const id of createdUserIds) {
      await prisma.userIdentity.deleteMany({ where: { userId: id } });
      await prisma.siteMembership.deleteMany({ where: { userId: id } });
      await prisma.user.deleteMany({ where: { id } });
    }
    await app?.close();
  });

  it("does not grant site access to an uninvited identity", async () => {
    if (!app) return;

    const service = app.get(AuthIdentityService);
    const result = await service.upsertFromProvider({
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

  it("links a second provider to the same user when the email is verified", async () => {
    if (!app) return;

    const service = app.get(AuthIdentityService);
    const sharedEmail = `verified-link-${randomUUID()}@example.test`;

    const first = await service.upsertFromProvider({
      provider: "auth0",
      subject: `auth0|verified-${randomUUID()}`,
      email: sharedEmail,
      emailVerified: true,
      name: "Verified User",
    });
    createdUserIds.push(first.userId);

    const second = await service.upsertFromProvider({
      provider: "clerk",
      subject: `clerk_verified-${randomUUID()}`,
      email: sharedEmail,
      emailVerified: true,
      name: "Verified User",
    });

    expect(second.userId).toBe(first.userId);
  });

  it("does not link a second provider by an unverified email match", async () => {
    if (!app) return;

    const service = app.get(AuthIdentityService);
    const sharedEmail = `unverified-link-${randomUUID()}@example.test`;

    const first = await service.upsertFromProvider({
      provider: "auth0",
      subject: `auth0|unverified-${randomUUID()}`,
      email: sharedEmail,
      emailVerified: true,
      name: "First User",
    });
    createdUserIds.push(first.userId);

    const second = await service.upsertFromProvider({
      provider: "clerk",
      subject: `clerk_unverified-${randomUUID()}`,
      email: sharedEmail,
      emailVerified: false,
      name: "Second User",
    });
    createdUserIds.push(second.userId);

    expect(second.userId).not.toBe(first.userId);
  });

  it("resolves by externalId even without a matching email", async () => {
    if (!app) return;

    const service = app.get(AuthIdentityService);
    const base = await service.upsertFromProvider({
      provider: "auth0",
      subject: `auth0|external-id-${randomUUID()}`,
      email: `external-id-${randomUUID()}@example.test`,
      name: "External Id User",
    });
    createdUserIds.push(base.userId);

    const linked = await service.upsertFromProvider({
      provider: "clerk",
      subject: `clerk_external-id-${randomUUID()}`,
      email: `different-${randomUUID()}@example.test`,
      externalId: base.userId,
    });

    expect(linked.userId).toBe(base.userId);
  });
});
