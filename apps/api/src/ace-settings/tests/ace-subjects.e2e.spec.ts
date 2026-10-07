import { randomUUID } from "node:crypto";
import {
  ConflictException,
  NotFoundException,
  type INestApplication,
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { prisma, withTenantRlsContext } from "@pathway/db";
import request from "supertest";
import {
  clearE2eAuthAccess,
  clearE2eTypedRole,
  isDatabaseAvailable,
  requireDatabase,
  seedE2eAuthUser,
  seedE2eTypedRole,
} from "../../../test-helpers.e2e";
import { AppModule } from "../../app.module";
import { StudentSubjectsService } from "../../pace/student-subjects.service";
import { AceSubjectsService } from "../ace-subjects.service";

describe("ACE core subject catalogue", () => {
  const orgId = randomUUID();
  const siteAId = randomUUID();
  const siteBId = randomUUID();
  const userId = randomUUID();
  const readerId = randomUUID();
  const childId = randomUUID();
  const actor = { orgId, tenantId: siteAId, userId };
  const service = new AceSubjectsService();
  let app: INestApplication | undefined;
  let managerAuthorization = "";
  let readerAuthorization = "";
  let managerRole: Awaited<ReturnType<typeof seedE2eTypedRole>> | undefined;
  let readerRole: Awaited<ReturnType<typeof seedE2eTypedRole>> | undefined;

  beforeAll(async () => {
    if (!requireDatabase()) return;
    await prisma.org.create({
      data: {
        id: orgId,
        name: `ACE subject catalogue ${orgId}`,
        slug: `ace-subjects-${orgId}`,
        planCode: "trial",
      },
    });
    await prisma.tenant.createMany({
      data: [siteAId, siteBId].map((id) => ({
        id,
        orgId,
        name: `ACE subject site ${id}`,
        slug: `ace-subjects-${id}`,
        timezone: "Europe/London",
      })),
    });
    await prisma.orgVertical.create({
      data: { orgId, vertical: "ACE_SCHOOL" },
    });
    const manager = await seedE2eAuthUser({
      subject: `ace-subject-manager-${userId}`,
      userId,
      tenantId: siteAId,
      siteRole: "SITE_ADMIN",
      orgId,
      orgRole: "ORG_ADMIN",
    });
    const reader = await seedE2eAuthUser({
      subject: `ace-subject-reader-${readerId}`,
      userId: readerId,
      tenantId: siteAId,
      siteRole: "STAFF",
      orgId,
      orgRole: "ORG_MEMBER",
    });
    managerAuthorization = manager.authorization;
    readerAuthorization = reader.authorization;
    managerRole = await seedE2eTypedRole({
      orgId,
      tenantId: siteAId,
      userId,
      scope: "site",
      permissionKeys: ["ace.settings.read", "ace.settings.manage"],
    });
    readerRole = await seedE2eTypedRole({
      orgId,
      tenantId: siteAId,
      userId: readerId,
      scope: "site",
      permissionKeys: ["ace.settings.read"],
    });
    await withTenantRlsContext(siteAId, orgId, async (tx) => {
      await tx.child.create({
        data: {
          id: childId,
          tenantId: siteAId,
          firstName: "ACE",
          lastName: "Learner",
        },
      });
    });
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (!isDatabaseAvailable()) return;
    await app?.close();
    await prisma.studentSubjectEnrollment.deleteMany({
      where: { tenantId: siteAId },
    });
    await prisma.auditEvent.deleteMany({ where: { orgId } });
    await prisma.child.deleteMany({ where: { id: childId } });
    await prisma.subject.deleteMany({ where: { tenantId: siteAId } });
    if (readerRole) await clearE2eTypedRole(readerRole, orgId);
    if (managerRole) await clearE2eTypedRole(managerRole, orgId);
    await clearE2eAuthAccess(readerId);
    await clearE2eAuthAccess(userId);
    await prisma.user.deleteMany({ where: { id: { in: [userId, readerId] } } });
    await prisma.orgVertical.deleteMany({ where: { orgId } });
    await prisma.tenant.deleteMany({
      where: { id: { in: [siteAId, siteBId] } },
    });
    await prisma.org.delete({ where: { id: orgId } });
  });

  it("allows ACE core reads and writes while denying an unprivileged writer", async () => {
    if (!app) return;
    expect(await prisma.orgModule.count({ where: { orgId } })).toBe(0);

    const created = await request(app.getHttpServer())
      .post("/ace/subjects")
      .set("Authorization", managerAuthorization)
      .send({ name: "Science", reason: "Set up PACE subjects" });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: "Science", isActive: true });

    const listed = await request(app.getHttpServer())
      .get("/ace/subjects")
      .set("Authorization", readerAuthorization);
    expect(listed.status).toBe(200);
    expect(listed.body).toContainEqual(
      expect.objectContaining({ id: created.body.id, name: "Science" }),
    );

    const renamed = await request(app.getHttpServer())
      .patch(`/ace/subjects/${created.body.id}`)
      .set("Authorization", managerAuthorization)
      .send({ name: "Natural Science", reason: "Match the site catalogue" });
    expect(renamed.status).toBe(200);
    expect(renamed.body.name).toBe("Natural Science");

    const deactivated = await request(app.getHttpServer())
      .post(`/ace/subjects/${created.body.id}/deactivate`)
      .set("Authorization", managerAuthorization)
      .send({ reason: "No new placements" });
    expect(deactivated.status).toBe(200);
    expect(deactivated.body.isActive).toBe(false);

    const invalid = await request(app.getHttpServer())
      .post("/ace/subjects")
      .set("Authorization", managerAuthorization)
      .send({ name: " ", reason: "Missing name" });
    expect(invalid.status).toBe(400);

    const denied = await request(app.getHttpServer())
      .post("/ace/subjects")
      .set("Authorization", readerAuthorization)
      .send({ name: "Unauthorized", reason: "Attempted write" });
    expect(denied.status).toBe(403);
    expect(
      await prisma.subject.count({
        where: { tenantId: siteAId, name: "Unauthorized" },
      }),
    ).toBe(0);
  });

  it("supports a site-scoped catalogue without a paid Learning module", async () => {
    if (!isDatabaseAvailable()) return;
    expect(await prisma.orgModule.count({ where: { orgId } })).toBe(0);

    const created = await service.create(
      { name: "Mathematics", reason: "Set up the PACE catalogue" },
      actor,
    );
    expect(created.isActive).toBe(true);
    await expect(service.list(actor)).resolves.toContainEqual(created);
    await expect(
      service.list({ ...actor, tenantId: siteBId }),
    ).resolves.toEqual([]);
    await expect(
      service.rename(
        created.id,
        { name: "Other site name", reason: "Attempted cross-site change" },
        { ...actor, tenantId: siteBId },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.list({ ...actor, orgId: randomUUID() }),
    ).rejects.toBeInstanceOf(NotFoundException);

    await expect(
      service.create({ name: created.name, reason: "Duplicate" }, actor),
    ).rejects.toBeInstanceOf(ConflictException);
    const renamed = await service.rename(
      created.id,
      { name: "Maths", reason: "Use the school name" },
      actor,
    );
    expect(renamed.name).toBe("Maths");

    await withTenantRlsContext(siteAId, orgId, (tx) =>
      tx.studentSubjectEnrollment.create({
        data: {
          tenantId: siteAId,
          childId,
          subjectId: created.id,
          startsOn: new Date("2026-09-01T12:00:00.000Z"),
          startingPace: 1001,
          currentPace: 1001,
          targetPace: 1003,
          recordedByUserId: userId,
          reason: "Initial PACE placement",
        },
      }),
    );
    const inactive = await service.deactivate(
      created.id,
      { reason: "No new placements" },
      actor,
    );
    expect(inactive.isActive).toBe(false);
    const placements = await new StudentSubjectsService().list(childId, actor);
    expect(placements.placements).toEqual([
      expect.objectContaining({ subjectId: created.id, subjectName: "Maths" }),
    ]);
    expect(placements.subjects).not.toContainEqual(
      expect.objectContaining({ id: created.id }),
    );
    expect(
      await prisma.auditEvent.count({ where: { orgId, entityId: created.id } }),
    ).toBe(3);
  });

  it("rolls back subject creation if the audit actor is invalid", async () => {
    if (!isDatabaseAvailable()) return;
    const name = `Rollback ${randomUUID()}`;
    await expect(
      service.create(
        { name, reason: "Verify atomic audit" },
        { ...actor, userId: randomUUID() },
      ),
    ).rejects.toBeDefined();
    await expect(service.list(actor)).resolves.not.toContainEqual(
      expect.objectContaining({ name }),
    );
  });
});
