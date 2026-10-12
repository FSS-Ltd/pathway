import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  ModuleStatus,
  Module,
  Prisma,
  prisma,
  withTenantRlsContext,
} from "@pathway/db";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { AppModule } from "../../app.module";
import { requireDatabase } from "../../../test-helpers.e2e";
import { signTestToken } from "../../auth/token-verifier";

async function bearer(subject: string): Promise<string> {
  return `Bearer ${await signTestToken({ sub: subject, emailVerified: true })}`;
}

describe("Learning capability guard chain (e2e)", () => {
  const orgId = process.env.E2E_ORG_ID as string;
  const tenantId = process.env.E2E_TENANT_ID as string;
  const activeUserId = randomUUID();
  const inactiveUserId = randomUUID();
  const noOrgUserId = randomUUID();
  const activeSubject = `learning-capability-${randomUUID()}`;
  let app: INestApplication | undefined;
  let originalLearningModule: Awaited<
    ReturnType<typeof prisma.orgModule.findUnique>
  > = null;

  beforeAll(async () => {
    if (!requireDatabase()) return;

    await withTenantRlsContext(tenantId, orgId, async (tx) => {
      for (const userId of [activeUserId, inactiveUserId]) {
        await tx.user.create({
          data: {
            id: userId,
            email: `${userId}@example.test`,
            lastActiveTenantId: tenantId,
          },
        });
        await tx.siteMembership.create({
          data: { tenantId, userId, role: "STAFF" },
        });
        await tx.userIdentity.create({
          data: {
            userId,
            provider: "auth0",
            providerSubject: userId,
          },
        });
      }
      await tx.user.create({
        data: { id: noOrgUserId, email: `${noOrgUserId}@example.test` },
      });
      await tx.userIdentity.create({
        data: {
          userId: noOrgUserId,
          provider: "auth0",
          providerSubject: noOrgUserId,
        },
      });
    });

    originalLearningModule = await prisma.orgModule.findUnique({
      where: { orgId_module: { orgId, module: Module.LEARNING } },
    });
    await prisma.orgModule.upsert({
      where: { orgId_module: { orgId, module: Module.LEARNING } },
      update: { status: ModuleStatus.ACTIVE, expiresAt: null },
      create: { orgId, module: Module.LEARNING, status: ModuleStatus.ACTIVE },
    });

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (requireDatabase()) {
      await withTenantRlsContext(tenantId, orgId, async (tx) => {
        await tx.subject.deleteMany({ where: { name: activeSubject } });
        await tx.userIdentity.deleteMany({
          where: { userId: { in: [activeUserId, inactiveUserId, noOrgUserId] } },
        });
        await tx.siteMembership.deleteMany({
          where: { userId: { in: [activeUserId, inactiveUserId] } },
        });
        await tx.user.deleteMany({
          where: { id: { in: [activeUserId, inactiveUserId, noOrgUserId] } },
        });
      }).catch(() => undefined);
      if (originalLearningModule) {
        await prisma.orgModule.update({
          where: { id: originalLearningModule.id },
          data: {
            status: originalLearningModule.status,
            activatedAt: originalLearningModule.activatedAt,
            expiresAt: originalLearningModule.expiresAt,
            metadata: originalLearningModule.metadata ?? Prisma.JsonNull,
          },
        });
      } else {
        await prisma.orgModule.deleteMany({
          where: { orgId, module: Module.LEARNING },
        });
      }
    }
    await app?.close();
  });

  it("reaches the handler when the organisation has Learning active", async () => {
    if (!app) return;

    const response = await request(app.getHttpServer())
      .post("/learning/subjects")
      .set("Authorization", await bearer(activeUserId))
      .send({ name: activeSubject });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ name: activeSubject, tenantId });
  });

  it("rejects the same route when Learning is inactive", async () => {
    if (!app) return;
    await prisma.orgModule.update({
      where: { orgId_module: { orgId, module: Module.LEARNING } },
      data: { status: ModuleStatus.CANCELLED },
    });

    const response = await request(app.getHttpServer())
      .post("/learning/subjects")
      .set("Authorization", await bearer(inactiveUserId))
      .send({ name: "Blocked subject" });

    expect(response.status).toBe(403);
    expect(response.body.message).toBe("Missing capability: learning.log.write");
  });

  it("rejects a request with no active organisation", async () => {
    if (!app) return;

    const response = await request(app.getHttpServer())
      .post("/learning/subjects")
      .set("Authorization", await bearer(noOrgUserId))
      .send({ name: "No org subject" });

    expect(response.status).toBe(403);
    expect(response.body.message).toBe("No active organisation");
  });
});
