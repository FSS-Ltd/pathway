import { randomUUID } from "node:crypto";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { prisma } from "@pathway/db";
import request from "supertest";
import { AppModule } from "../../app.module";
import {
  clearE2eAuthAccess,
  clearE2eTypedRole,
  requireDatabase,
  seedE2eAuthUser,
  seedE2eTypedRole,
} from "../../../test-helpers.e2e";

/**
 * Proves the ACE-F14 cutover end-to-end for two representative matrix routes
 * on two different controllers/services (RolesController/RolesService and
 * AssignmentsController/AssignmentsService) - the guard chain is identical
 * for the other five R01-R14 routes (see access-matrix.spec.ts for the full
 * classification), so this is not repeated per route. Each route proves the
 * matrix formula's membership, capability, and permission layers are denied
 * INDEPENDENTLY: exactly one factor differs per case.
 */
describe("access route matrix (e2e)", () => {
  const orgWithVertical = randomUUID();
  const orgWithoutVertical = randomUUID();
  let app: INestApplication | undefined;
  const seededUserIds: string[] = [];

  beforeAll(async () => {
    if (!requireDatabase()) return;

    await prisma.org.createMany({
      data: [
        {
          id: orgWithVertical,
          name: "Access matrix org (with vertical)",
          slug: `access-matrix-with-vertical-${orgWithVertical}`,
          planCode: "trial",
        },
        {
          id: orgWithoutVertical,
          name: "Access matrix org (no vertical)",
          slug: `access-matrix-no-vertical-${orgWithoutVertical}`,
          planCode: "trial",
        },
      ],
    });
    await prisma.orgVertical.create({
      data: { orgId: orgWithVertical, vertical: "ACE_SCHOOL" },
    });

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (requireDatabase()) {
      for (const userId of seededUserIds) {
        await clearE2eAuthAccess(userId).catch(() => undefined);
      }
      await prisma.orgVertical
        .deleteMany({ where: { orgId: orgWithVertical } })
        .catch(() => undefined);
      await prisma.org
        .deleteMany({ where: { id: { in: [orgWithVertical, orgWithoutVertical] } } })
        .catch(() => undefined);
    }
    await app?.close();
  });

  describe("GET /access/roles (R01)", () => {
    it("allows a member holding platform.access.roles.read", async () => {
      if (!app) return;
      const subject = `access-matrix-r01-allow-${randomUUID()}`;
      const { userId, authorization } = await seedE2eAuthUser({
        subject,
        orgId: orgWithVertical,
        orgRole: "ORG_MEMBER",
      });
      seededUserIds.push(userId);
      const role = await seedE2eTypedRole({
        orgId: orgWithVertical,
        userId,
        scope: "organisation",
        permissionKeys: ["platform.access.roles.read"],
      });

      try {
        const response = await request(app.getHttpServer())
          .get("/access/roles")
          .set("Authorization", authorization);

        expect(response.status).not.toBe(403);
      } finally {
        await clearE2eTypedRole(role, orgWithVertical);
      }
    });

    it("denies a user with no organisation membership", async () => {
      if (!app) return;
      const subject = `access-matrix-r01-no-membership-${randomUUID()}`;
      const { userId, authorization } = await seedE2eAuthUser({ subject });
      seededUserIds.push(userId);

      const response = await request(app.getHttpServer())
        .get("/access/roles")
        .set("Authorization", authorization);

      expect(response.status).toBe(403);
    });

    it("denies a member of an organisation with no active capability", async () => {
      if (!app) return;
      const subject = `access-matrix-r01-no-capability-${randomUUID()}`;
      const { userId, authorization } = await seedE2eAuthUser({
        subject,
        orgId: orgWithoutVertical,
        orgRole: "ORG_MEMBER",
      });
      seededUserIds.push(userId);
      const role = await seedE2eTypedRole({
        orgId: orgWithoutVertical,
        userId,
        scope: "organisation",
        permissionKeys: ["platform.access.roles.read"],
      });

      try {
        const response = await request(app.getHttpServer())
          .get("/access/roles")
          .set("Authorization", authorization);

        expect(response.status).toBe(403);
      } finally {
        await clearE2eTypedRole(role, orgWithoutVertical);
      }
    });

    it("denies a member who holds a different typed permission", async () => {
      if (!app) return;
      const subject = `access-matrix-r01-wrong-permission-${randomUUID()}`;
      const { userId, authorization } = await seedE2eAuthUser({
        subject,
        orgId: orgWithVertical,
        orgRole: "ORG_MEMBER",
      });
      seededUserIds.push(userId);
      const role = await seedE2eTypedRole({
        orgId: orgWithVertical,
        userId,
        scope: "organisation",
        permissionKeys: ["platform.access.audit.read"],
      });

      try {
        const response = await request(app.getHttpServer())
          .get("/access/roles")
          .set("Authorization", authorization);

        expect(response.status).toBe(403);
      } finally {
        await clearE2eTypedRole(role, orgWithVertical);
      }
    });
  });

  describe("POST /access/assignments (R10)", () => {
    it("allows a member holding platform.access.assignments.manage", async () => {
      if (!app) return;
      const subject = `access-matrix-r10-allow-${randomUUID()}`;
      const { userId, authorization } = await seedE2eAuthUser({
        subject,
        orgId: orgWithVertical,
        orgRole: "ORG_MEMBER",
      });
      seededUserIds.push(userId);
      const role = await seedE2eTypedRole({
        orgId: orgWithVertical,
        userId,
        scope: "organisation",
        permissionKeys: ["platform.access.assignments.manage"],
      });

      try {
        const response = await request(app.getHttpServer())
          .post("/access/assignments")
          .set("Authorization", authorization)
          .send({
            userId: randomUUID(),
            roleDefinitionId: randomUUID(),
            startsAt: new Date().toISOString(),
          });

        expect(response.status).not.toBe(403);
      } finally {
        await clearE2eTypedRole(role, orgWithVertical);
      }
    });

    it("denies a user with no organisation membership", async () => {
      if (!app) return;
      const subject = `access-matrix-r10-no-membership-${randomUUID()}`;
      const { userId, authorization } = await seedE2eAuthUser({ subject });
      seededUserIds.push(userId);

      const response = await request(app.getHttpServer())
        .post("/access/assignments")
        .set("Authorization", authorization)
        .send({});

      expect(response.status).toBe(403);
    });

    it("denies a member of an organisation with no active capability", async () => {
      if (!app) return;
      const subject = `access-matrix-r10-no-capability-${randomUUID()}`;
      const { userId, authorization } = await seedE2eAuthUser({
        subject,
        orgId: orgWithoutVertical,
        orgRole: "ORG_MEMBER",
      });
      seededUserIds.push(userId);
      const role = await seedE2eTypedRole({
        orgId: orgWithoutVertical,
        userId,
        scope: "organisation",
        permissionKeys: ["platform.access.assignments.manage"],
      });

      try {
        const response = await request(app.getHttpServer())
          .post("/access/assignments")
          .set("Authorization", authorization)
          .send({});

        expect(response.status).toBe(403);
      } finally {
        await clearE2eTypedRole(role, orgWithoutVertical);
      }
    });

    it("denies a member who holds a different typed permission", async () => {
      if (!app) return;
      const subject = `access-matrix-r10-wrong-permission-${randomUUID()}`;
      const { userId, authorization } = await seedE2eAuthUser({
        subject,
        orgId: orgWithVertical,
        orgRole: "ORG_MEMBER",
      });
      seededUserIds.push(userId);
      const role = await seedE2eTypedRole({
        orgId: orgWithVertical,
        userId,
        scope: "organisation",
        permissionKeys: ["platform.access.assignments.read"],
      });

      try {
        const response = await request(app.getHttpServer())
          .post("/access/assignments")
          .set("Authorization", authorization)
          .send({});

        expect(response.status).toBe(403);
      } finally {
        await clearE2eTypedRole(role, orgWithVertical);
      }
    });
  });
});
