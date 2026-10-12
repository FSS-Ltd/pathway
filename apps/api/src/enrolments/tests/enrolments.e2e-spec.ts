import request from "supertest";
import { randomUUID } from "node:crypto";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { prisma, withTenantRlsContext } from "@pathway/db";
import { AppModule } from "../../app.module";
import { requireDatabase, seedE2eAuthUser } from "../../../test-helpers.e2e";
import { EnrolmentIdentitiesService } from "../enrolment-identities.service";
import { EnrolmentRollService } from "../enrolment-roll.service";

describe("continuing enrolment (e2e)", () => {
  let app: INestApplication;
  let identities: EnrolmentIdentitiesService;
  let roll: EnrolmentRollService;
  let orgId: string;
  let tenantId: string;
  let secondTenantId: string;
  let authHeader: string;
  let billingHeader: string;
  let actorId: string;

  beforeAll(async () => {
    if (!requireDatabase()) return;
    orgId = randomUUID();
    tenantId = randomUUID();
    secondTenantId = randomUUID();
    await prisma.org.create({
      data: {
        id: orgId,
        name: "Enrolment e2e",
        slug: `enrolment-${orgId}`,
        planCode: "starter",
      },
    });
    await prisma.tenant.createMany({
      data: [
        {
          id: tenantId,
          orgId,
          name: "First site",
          slug: `enrolment-${tenantId}`,
        },
        {
          id: secondTenantId,
          orgId,
          name: "Second site",
          slug: `enrolment-${secondTenantId}`,
        },
      ],
    });
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    identities = app.get(EnrolmentIdentitiesService);
    roll = app.get(EnrolmentRollService);
    const auth = await seedE2eAuthUser({
      subject: `enrolment-${Date.now()}`,
      tenantId,
      siteRole: "SITE_ADMIN",
      orgId,
      orgRole: "ORG_ADMIN",
    });
    authHeader = auth.authorization;
    actorId = auth.userId;
    const billingAuth = await seedE2eAuthUser({
      subject: `enrolment-billing-${Date.now()}`,
      tenantId,
      orgId,
      orgRole: "ORG_BILLING",
    });
    billingHeader = billingAuth.authorization;
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it("keeps child identities outside billing-only access", async () => {
    if (!app) return;
    const response = await request(app.getHttpServer())
      .get("/enrolments/candidates")
      .set("Authorization", billingHeader);
    expect(response.status).toBe(403);
  });

  it("keeps candidates unverified and counts one child across two sites", async () => {
    if (!app) return;
    const nonce = Date.now();
    const first = await withTenantRlsContext(tenantId, orgId, (tx) =>
      tx.child.create({
        data: { tenantId, firstName: "Roll", lastName: `One-${nonce}` },
        select: { id: true },
      }),
    );
    const second = await withTenantRlsContext(secondTenantId, orgId, (tx) =>
      tx.child.create({
        data: {
          tenantId: secondTenantId,
          firstName: "Roll",
          lastName: `Two-${nonce}`,
        },
        select: { id: true },
      }),
    );

    const candidates = await request(app.getHttpServer())
      .get("/enrolments/candidates")
      .set("Authorization", authHeader);
    expect(candidates.status).toBe(200);
    expect(candidates.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: first.id })]),
    );
    expect((await roll.latestConfirmation(orgId))?.enrolledCount ?? 0).toBe(0);

    const created = await request(app.getHttpServer())
      .post("/enrolments/identities")
      .set("Authorization", authHeader)
      .send({ localReference: `roll-${nonce}`, childId: first.id });
    expect(created.status).toBe(201);
    expect(created.body.localReference).toBe(`ROLL-${nonce}`);
    const identityId = created.body.id as string;
    expect(
      await prisma.orgChildIdentity.findUnique({
        where: { id: identityId },
        select: { orgId: true, localReference: true },
      }),
    ).toEqual({ orgId, localReference: `ROLL-${nonce}` });
    expect(
      await prisma.orgChildIdentity.count({
        where: { orgId, localReference: `ROLL-${nonce}` },
      }),
    ).toBe(1);
    await expect(
      identities.createIdentity(
        orgId,
        secondTenantId,
        `ROLL-${nonce}`,
        second.id,
      ),
    ).rejects.toThrow("Identity or profile already linked.");
    const otherOrgId = randomUUID();
    const otherTenantId = randomUUID();
    await prisma.org.create({
      data: {
        id: otherOrgId,
        name: "Independent organisation",
        slug: `enrolment-${otherOrgId}`,
        planCode: "starter",
      },
    });
    await prisma.tenant.create({
      data: {
        id: otherTenantId,
        orgId: otherOrgId,
        name: "Independent site",
        slug: `enrolment-${otherTenantId}`,
      },
    });
    const otherChild = await withTenantRlsContext(
      otherTenantId,
      otherOrgId,
      (tx) =>
        tx.child.create({
          data: {
            tenantId: otherTenantId,
            firstName: "Other",
            lastName: "Child",
          },
          select: { id: true },
        }),
    );
    await expect(
      identities.linkProfile(orgId, otherTenantId, identityId, otherChild.id),
    ).rejects.toThrow();
    await expect(
      identities.createIdentity(
        otherOrgId,
        otherTenantId,
        `roll-${nonce}`,
        otherChild.id,
      ),
    ).resolves.toHaveProperty("id");
    await expect(
      identities.linkProfile(orgId, secondTenantId, identityId, second.id),
    ).resolves.toMatchObject({
      identityId,
      tenantId: secondTenantId,
    });
    await expect(
      identities.linkProfile(orgId, secondTenantId, identityId, second.id),
    ).rejects.toThrow();

    const admitted = await request(app.getHttpServer())
      .post(`/enrolments/identities/${identityId}/revisions`)
      .set("Authorization", authHeader)
      .send({
        action: "admit",
        date: "2026-09-01",
        reason: "Confirmed admission",
      });
    expect(admitted.status).toBe(201);
    expect((await roll.roll(orgId, "2026-12-25")).enrolledCount).toBe(1);
    const forecast = await request(app.getHttpServer())
      .get("/enrolments/roll?effectiveOn=2026-12-25")
      .set("Authorization", authHeader);
    expect(forecast.status).toBe(200);
    expect(forecast.body.enrolledCount).toBe(1);

    const confirmed = await request(app.getHttpServer())
      .post("/enrolments/roll/confirm")
      .set("Authorization", authHeader)
      .send({ effectiveOn: "2026-12-25" });
    expect(confirmed.status).toBe(201);
    expect(confirmed.body.enrolledCount).toBe(1);

    const left = await request(app.getHttpServer())
      .post(`/enrolments/identities/${identityId}/revisions`)
      .set("Authorization", authHeader)
      .send({
        action: "leave",
        date: "2027-01-15",
        reason: "Confirmed departure",
      });
    expect(left.status).toBe(201);
    expect((await roll.roll(orgId, "2027-01-15")).enrolledCount).toBe(0);
    expect((await roll.latestConfirmation(orgId))?.enrolledCount).toBe(1);
    const earlierCutoff = new Date(confirmed.body.revisionCutoff as string);
    expect(
      (await roll.roll(orgId, "2027-02-01", earlierCutoff)).enrolledCount,
    ).toBe(1);

    const reenrolled = await request(app.getHttpServer())
      .post(`/enrolments/identities/${identityId}/revisions`)
      .set("Authorization", authHeader)
      .send({
        action: "reenrol",
        date: "2027-03-01",
        reason: "Returned to the roll",
      });
    expect(reenrolled.status).toBe(201);
    expect((await roll.roll(orgId, "2027-02-01")).enrolledCount).toBe(0);
    expect((await roll.roll(orgId, "2027-03-01")).enrolledCount).toBe(1);

    const correction = await request(app.getHttpServer())
      .post(`/enrolments/identities/${identityId}/revisions`)
      .set("Authorization", authHeader)
      .send({
        action: "correct",
        periods: [
          { admittedOn: "2026-09-01", leftOn: "2026-10-01" },
          { admittedOn: "2027-03-01", leftOn: null },
        ],
        reason: "Backdated leaving evidence",
      });
    expect(correction.status).toBe(201);
    expect((await roll.roll(orgId, "2026-12-25")).enrolledCount).toBe(0);
    expect((await roll.latestConfirmation(orgId))?.enrolledCount).toBe(1);
    expect(
      (await roll.roll(orgId, "2026-12-25", earlierCutoff)).enrolledCount,
    ).toBe(1);

    const concurrentChild = await withTenantRlsContext(tenantId, orgId, (tx) =>
      tx.child.create({
        data: { tenantId, firstName: "Concurrent", lastName: `Child-${nonce}` },
        select: { id: true },
      }),
    );
    const concurrentIdentity = await identities.createIdentity(
      orgId,
      tenantId,
      `concurrent-${nonce}`,
      concurrentChild.id,
    );
    const attempts = await Promise.allSettled([
      roll.recordChange(
        orgId,
        concurrentIdentity.id,
        actorId,
        "admit",
        "2026-09-01",
        undefined,
        "First admission",
      ),
      roll.recordChange(
        orgId,
        concurrentIdentity.id,
        actorId,
        "admit",
        "2026-09-01",
        undefined,
        "Duplicate admission",
      ),
    ]);
    expect(
      attempts.filter((attempt) => attempt.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      attempts.filter((attempt) => attempt.status === "rejected"),
    ).toHaveLength(1);
    const auditActions = await prisma.auditEvent.findMany({
      where: { orgId, entityId: identityId },
      select: { entityType: true, action: true, actorUserId: true },
    });
    expect(auditActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityType: "ENROLMENT",
          action: "CREATED",
          actorUserId: actorId,
        }),
        expect.objectContaining({
          entityType: "ENROLMENT",
          action: "UPDATED",
          actorUserId: actorId,
        }),
      ]),
    );
    expect(
      await prisma.auditEvent.count({
        where: { orgId, entityType: "ENROLMENT_ROLL" },
      }),
    ).toBe(1);
  });

  it("hides another organisation's identities and site links under a restricted database role", async () => {
    if (!app || !process.env.E2E_RLS_ROLE) return;
    const role = process.env.E2E_RLS_ROLE;
    if (role !== "pathway_e2e_rls") {
      throw new Error("Unexpected RLS test role.");
    }
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL ROLE pathway_e2e_rls");
      await tx.$executeRaw`SELECT set_config('app.org_id', ${orgId}, true)`;
      const identities = await tx.$queryRaw<{ orgId: string }[]>`
        SELECT "orgId" FROM "OrgChildIdentity"`;
      const links = await tx.$queryRaw<{ orgId: string }[]>`
        SELECT "orgId" FROM "OrgChildSiteLink"`;
      expect(identities.length).toBeGreaterThan(0);
      expect(links.length).toBeGreaterThan(0);
      expect(identities.every((row) => row.orgId === orgId)).toBe(true);
      expect(links.every((row) => row.orgId === orgId)).toBe(true);
    });
  });
});
