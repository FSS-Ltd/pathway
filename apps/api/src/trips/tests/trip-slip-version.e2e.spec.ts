import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
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
import { slipVersionHash, parseSlipSnapshot } from "../permission-slip-version";

describe("ACE trip and permission-slip versioning", () => {
  const orgId = randomUUID();
  const foreignOrgId = randomUUID();
  const siteId = randomUUID();
  const foreignSiteId = randomUUID();
  const leaderId = randomUUID();
  const orgHeadId = randomUUID();
  const staffId = randomUUID();
  const foreignLeaderId = randomUUID();
  const childId = randomUUID();
  const anotherChildId = randomUUID();
  const foreignChildId = randomUUID();
  const yearId = randomUUID();
  const bandId = randomUUID();
  const oldPublication = process.env.ACE_TRIP_SLIP_PUBLICATION_ENABLED;
  const oldCronSecret = process.env.CRON_SECRET;
  const cronSecret = `trip-slip-${randomUUID()}`;
  let app: INestApplication | undefined;
  let leaderAuth = "";
  let orgHeadAuth = "";
  let staffAuth = "";
  let foreignAuth = "";
  let leaderRole: Awaited<ReturnType<typeof seedE2eTypedRole>> | undefined;
  let orgHeadRole: Awaited<ReturnType<typeof seedE2eTypedRole>> | undefined;
  let staffRole: Awaited<ReturnType<typeof seedE2eTypedRole>> | undefined;
  let foreignRole: Awaited<ReturnType<typeof seedE2eTypedRole>> | undefined;

  const tripInput = () => ({
    title: "Museum visit",
    destination: "Science Museum",
    startsAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    endsAt: new Date(
      Date.now() + 30 * 86_400_000 + 7 * 3_600_000,
    ).toISOString(),
  });
  const slipInput = () => ({
    title: "Museum consent",
    description: "Bring lunch",
    consentText: "I consent to this school visit.",
    deadlineAt: new Date(Date.now() + 10 * 86_400_000).toISOString(),
    questions: [{ label: "Emergency contact", required: true }],
    recipientChildIds: [childId, anotherChildId],
  });

  async function createTripAndSlip() {
    if (!app) throw new Error("E2E app did not start");
    const tripDraftInput = tripInput();
    const trip = await request(app.getHttpServer())
      .post(`/school/sites/${siteId}/trips`)
      .set("Authorization", leaderAuth)
      .send(tripDraftInput);
    expect(trip.status).toBe(201);
    const draftInput = slipInput();
    const slip = await request(app.getHttpServer())
      .post(`/school/sites/${siteId}/permission-slips`)
      .set("Authorization", leaderAuth)
      .send({ ...draftInput, tripId: trip.body.id });
    expect(slip.status).toBe(201);
    return {
      tripId: trip.body.id as string,
      slipId: slip.body.id as string,
      versionId: slip.body.versions[0].id as string,
      draftInput,
      tripDraftInput,
    };
  }

  beforeAll(async () => {
    if (!requireDatabase())
      throw new Error("PostgreSQL is required for trip-slip version E2E");
    process.env.ACE_TRIP_SLIP_PUBLICATION_ENABLED = "true";
    process.env.CRON_SECRET = cronSecret;
    await prisma.org.createMany({
      data: [
        {
          id: orgId,
          name: "Trip school",
          slug: `trip-${orgId}`,
          planCode: "trial",
        },
        {
          id: foreignOrgId,
          name: "Other trip school",
          slug: `trip-${foreignOrgId}`,
          planCode: "trial",
        },
      ],
    });
    await prisma.orgVertical.createMany({
      data: [orgId, foreignOrgId].map((id) => ({
        orgId: id,
        vertical: "ACE_SCHOOL" as const,
      })),
    });
    await prisma.tenant.createMany({
      data: [
        {
          id: siteId,
          orgId,
          name: "Trip school",
          slug: `trip-${siteId}`,
          timezone: "Europe/London",
        },
        {
          id: foreignSiteId,
          orgId: foreignOrgId,
          name: "Other trip school",
          slug: `trip-${foreignSiteId}`,
          timezone: "Europe/London",
        },
      ],
    });
    leaderAuth = (
      await seedE2eAuthUser({
        subject: `trip-leader-${leaderId}`,
        userId: leaderId,
        tenantId: siteId,
        siteRole: "SITE_ADMIN",
        orgId,
        orgRole: "ORG_ADMIN",
      })
    ).authorization;
    orgHeadAuth = (
      await seedE2eAuthUser({
        subject: `trip-org-head-${orgHeadId}`,
        userId: orgHeadId,
        tenantId: siteId,
        orgId,
        orgRole: "ORG_ADMIN",
      })
    ).authorization;
    staffAuth = (
      await seedE2eAuthUser({
        subject: `trip-staff-${staffId}`,
        userId: staffId,
        tenantId: siteId,
        siteRole: "STAFF",
        orgId,
        orgRole: "ORG_MEMBER",
      })
    ).authorization;
    foreignAuth = (
      await seedE2eAuthUser({
        subject: `trip-foreign-${foreignLeaderId}`,
        userId: foreignLeaderId,
        tenantId: foreignSiteId,
        siteRole: "SITE_ADMIN",
        orgId: foreignOrgId,
        orgRole: "ORG_ADMIN",
      })
    ).authorization;
    const permissionKeys = [
      "school.trips.read",
      "school.trips.manage",
      "school.permission_slips.read",
      "school.permission_slips.manage",
    ];
    leaderRole = await seedE2eTypedRole({
      orgId,
      tenantId: siteId,
      userId: leaderId,
      scope: "site",
      permissionKeys,
    });
    orgHeadRole = await seedE2eTypedRole({
      orgId,
      userId: orgHeadId,
      scope: "organisation",
      permissionKeys,
    });
    staffRole = await seedE2eTypedRole({
      orgId,
      tenantId: siteId,
      userId: staffId,
      scope: "site",
      permissionKeys,
    });
    foreignRole = await seedE2eTypedRole({
      orgId: foreignOrgId,
      tenantId: foreignSiteId,
      userId: foreignLeaderId,
      scope: "site",
      permissionKeys,
    });
    await withTenantRlsContext(siteId, orgId, async (tx) => {
      await tx.academicYear.create({
        data: {
          id: yearId,
          tenantId: siteId,
          name: "Trip year",
          startsOn: new Date(Date.now() - 30 * 86_400_000),
          endsOn: new Date(Date.now() + 90 * 86_400_000),
          status: "ACTIVE",
        },
      });
      await tx.aceYearBand.create({
        data: { id: bandId, tenantId: siteId, name: "Year 5" },
      });
      await tx.child.createMany({
        data: [childId, anotherChildId].map((id) => ({
          id,
          tenantId: siteId,
          firstName: "Trip",
          lastName: "Pupil",
        })),
      });
      await tx.aceSchoolEnrollment.createMany({
        data: [childId, anotherChildId].map((id) => ({
          tenantId: siteId,
          childId: id,
          academicYearId: yearId,
          yearBandId: bandId,
          startsOn: new Date(Date.now() - 10 * 86_400_000),
        })),
      });
    });
    await withTenantRlsContext(foreignSiteId, foreignOrgId, (tx) =>
      tx.child.create({
        data: {
          id: foreignChildId,
          tenantId: foreignSiteId,
          firstName: "Foreign",
          lastName: "Pupil",
        },
      }),
    );
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (oldPublication === undefined)
      delete process.env.ACE_TRIP_SLIP_PUBLICATION_ENABLED;
    else process.env.ACE_TRIP_SLIP_PUBLICATION_ENABLED = oldPublication;
    if (oldCronSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = oldCronSecret;
    await app?.close();
    if (!isDatabaseAvailable()) return;
    await prisma.$executeRaw`TRUNCATE TABLE "PermissionSlipReminder", "PermissionSlipException", "PermissionSlipResponse", "PermissionSlipRecipient", "PermissionSlipVersion", "PermissionSlip", "TripCheckpointAttendance", "TripCheckpoint", "Trip"`;
    await prisma.aceSchoolEnrollment.deleteMany({
      where: { tenantId: siteId },
    });
    await prisma.child.deleteMany({
      where: { tenantId: { in: [siteId, foreignSiteId] } },
    });
    await prisma.aceYearBand.deleteMany({ where: { tenantId: siteId } });
    await prisma.academicYear.deleteMany({ where: { tenantId: siteId } });
    await prisma.auditEvent.deleteMany({
      where: { orgId: { in: [orgId, foreignOrgId] } },
    });
    if (leaderRole) await clearE2eTypedRole(leaderRole, orgId);
    if (orgHeadRole) await clearE2eTypedRole(orgHeadRole, orgId);
    if (staffRole) await clearE2eTypedRole(staffRole, orgId);
    if (foreignRole) await clearE2eTypedRole(foreignRole, foreignOrgId);
    await clearE2eAuthAccess(leaderId);
    await clearE2eAuthAccess(orgHeadId);
    await clearE2eAuthAccess(staffId);
    await clearE2eAuthAccess(foreignLeaderId);
    await prisma.user.deleteMany({
      where: { id: { in: [leaderId, orgHeadId, staffId, foreignLeaderId] } },
    });
    await prisma.orgVertical.deleteMany({
      where: { orgId: { in: [orgId, foreignOrgId] } },
    });
    await prisma.tenant.deleteMany({
      where: { id: { in: [siteId, foreignSiteId] } },
    });
    await prisma.org.deleteMany({
      where: { id: { in: [orgId, foreignOrgId] } },
    });
  });

  it("freezes wording and recipients, tolerates duplicate publish, and denies another site", async () => {
    if (!app) throw new Error("E2E app did not start");
    const { tripId, slipId, versionId, tripDraftInput } =
      await createTripAndSlip();
    const route = `/school/sites/${siteId}/permission-slips/${slipId}`;
    const denied = await request(app.getHttpServer())
      .get(route)
      .set("Authorization", foreignAuth);
    expect(denied.status).toBe(404);
    const draft = await request(app.getHttpServer())
      .get(route)
      .set("Authorization", leaderAuth);
    expect(draft.status).toBe(200);
    const foreignRecipient = await request(app.getHttpServer())
      .patch(`${route}/draft`)
      .set("Authorization", leaderAuth)
      .send({
        ...slipInput(),
        recipientChildIds: [foreignChildId],
        expectedUpdatedAt: draft.body.versions[0].updatedAt,
      });
    expect(foreignRecipient.status).toBe(200);
    const invalidPublish = await request(app.getHttpServer())
      .post(`${route}/publish`)
      .set("Authorization", leaderAuth)
      .send({ expectedVersionId: versionId });
    expect(invalidPublish.status).toBe(409);
    const restored = await request(app.getHttpServer())
      .patch(`${route}/draft`)
      .set("Authorization", leaderAuth)
      .send({
        ...slipInput(),
        trip: { ...tripDraftInput, destination: "New Science Centre" },
        expectedUpdatedAt: foreignRecipient.body.updatedAt,
      });
    expect(restored.status).toBe(200);
    const staffPublish = await request(app.getHttpServer())
      .post(`${route}/publish`)
      .set("Authorization", staffAuth)
      .send({ expectedVersionId: versionId });
    expect(staffPublish.status).toBe(403);
    const first = await request(app.getHttpServer())
      .post(`${route}/publish`)
      .set("Authorization", leaderAuth)
      .send({ expectedVersionId: versionId });
    expect(first.status).toBe(201);
    const again = await request(app.getHttpServer())
      .post(`${route}/publish`)
      .set("Authorization", leaderAuth)
      .send({ expectedVersionId: versionId });
    expect(again.status).toBe(201);
    expect(again.body.versionHash).toBe(first.body.versionHash);
    const published = await withTenantRlsContext(siteId, orgId, (tx) =>
      tx.permissionSlipVersion.findUniqueOrThrow({
        where: { id_tenantId: { id: versionId, tenantId: siteId } },
        include: { recipients: true },
      }),
    );
    expect(published.recipients.map((row) => row.childId).sort()).toEqual(
      [childId, anotherChildId].sort(),
    );
    expect(published.versionHash).toBe(
      slipVersionHash(parseSlipSnapshot(published.contentSnapshot)),
    );
    expect(parseSlipSnapshot(published.contentSnapshot).destination).toBe(
      "New Science Centre",
    );
    const tripAfterPublish = await withTenantRlsContext(siteId, orgId, (tx) =>
      tx.trip.findUniqueOrThrow({
        where: { id_tenantId: { id: tripId, tenantId: siteId } },
      }),
    );
    expect(tripAfterPublish.destination).toBe("New Science Centre");
    await expect(
      prisma.permissionSlipVersion.update({
        where: { id_tenantId: { id: versionId, tenantId: siteId } },
        data: { contentSnapshot: { tampered: true } },
      }),
    ).rejects.toThrow("Published permission-slip versions are immutable");
    const staleTripEdit = await request(app.getHttpServer())
      .patch(`/school/sites/${siteId}/trips/${tripId}`)
      .set("Authorization", leaderAuth)
      .send({ ...tripInput(), destination: "Changed destination" });
    expect(staleTripEdit.status).toBe(409);
  });

  it("creates material revisions requiring reconsent and title-only corrections", async () => {
    if (!app) throw new Error("E2E app did not start");
    const { slipId, versionId, draftInput } = await createTripAndSlip();
    const route = `/school/sites/${siteId}/permission-slips/${slipId}`;
    await request(app.getHttpServer())
      .post(`${route}/publish`)
      .set("Authorization", leaderAuth)
      .send({ expectedVersionId: versionId })
      .expect(201);
    const material = await request(app.getHttpServer())
      .post(`${route}/revisions`)
      .set("Authorization", leaderAuth)
      .send({
        ...draftInput,
        consentText: "I consent to the revised visit.",
        expectedVersionId: versionId,
      });
    expect(material.status).toBe(201);
    expect(material.body.changeClassification).toBe("MATERIAL");
    expect(material.body.requiresReconsent).toBe(true);
    const materialPublish = await request(app.getHttpServer())
      .post(`${route}/publish`)
      .set("Authorization", leaderAuth)
      .send({ expectedVersionId: material.body.id });
    expect(materialPublish.status).toBe(201);
    const correction = await request(app.getHttpServer())
      .post(`${route}/revisions`)
      .set("Authorization", leaderAuth)
      .send({
        ...draftInput,
        title: "Museum consent (Year 5)",
        consentText: "I consent to the revised visit.",
        expectedVersionId: material.body.id,
      });
    expect(correction.status).toBe(201);
    expect(correction.body.changeClassification).toBe("NON_MATERIAL");
    expect(correction.body.requiresReconsent).toBe(false);
  });

  it("publishes due schedules and cancels a trip without rewriting published versions", async () => {
    if (!app) throw new Error("E2E app did not start");
    const { tripId, slipId, versionId } = await createTripAndSlip();
    const route = `/school/sites/${siteId}/permission-slips/${slipId}`;
    const scheduled = await request(app.getHttpServer())
      .post(`${route}/schedule`)
      .set("Authorization", leaderAuth)
      .send({
        expectedVersionId: versionId,
        scheduledAt: new Date(Date.now() + 3_600_000).toISOString(),
      });
    expect(scheduled.status).toBe(201);
    await withTenantRlsContext(siteId, orgId, (tx) =>
      tx.permissionSlipVersion.update({
        where: { id_tenantId: { id: versionId, tenantId: siteId } },
        data: { scheduledAt: new Date(Date.now() - 1_000) },
      }),
    );
    const unauthorised = await request(app.getHttpServer()).get(
      "/internal/permission-slip-schedules/run",
    );
    expect(unauthorised.status).toBe(401);
    const due = await request(app.getHttpServer())
      .get("/internal/permission-slip-schedules/run")
      .set("Authorization", `Bearer ${cronSecret}`);
    expect(due.status).toBe(200);
    expect(due.body.published).toBeGreaterThanOrEqual(1);
    const cancelled = await request(app.getHttpServer())
      .post(`/school/sites/${siteId}/trips/${tripId}/cancel`)
      .set("Authorization", leaderAuth)
      .send({ reason: "Venue unavailable" });
    expect(cancelled.status).toBe(201);
    const version = await withTenantRlsContext(siteId, orgId, (tx) =>
      tx.permissionSlipVersion.findUniqueOrThrow({
        where: { id_tenantId: { id: versionId, tenantId: siteId } },
      }),
    );
    expect(version.publishedAt).not.toBeNull();
    expect(version.versionHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("cancels a pending schedule and prevents a cancelled trip from publishing", async () => {
    if (!app) throw new Error("E2E app did not start");
    const { tripId, slipId, versionId } = await createTripAndSlip();
    const route = `/school/sites/${siteId}/permission-slips/${slipId}`;
    const server = app.getHttpServer();
    const schedule = () =>
      request(server)
        .post(`${route}/schedule`)
        .set("Authorization", leaderAuth)
        .send({
          expectedVersionId: versionId,
          scheduledAt: new Date(Date.now() + 3_600_000).toISOString(),
        });
    await schedule().expect(201);
    const cancelledSchedule = await request(app.getHttpServer())
      .post(`${route}/cancel-schedule`)
      .set("Authorization", leaderAuth)
      .send({ expectedVersionId: versionId });
    expect(cancelledSchedule.status).toBe(201);
    expect(cancelledSchedule.body.scheduledAt).toBeNull();
    await schedule().expect(201);
    await request(app.getHttpServer())
      .post(`/school/sites/${siteId}/trips/${tripId}/cancel`)
      .set("Authorization", leaderAuth)
      .send({ reason: "School cancelled the visit" })
      .expect(201);
    const version = await withTenantRlsContext(siteId, orgId, (tx) =>
      tx.permissionSlipVersion.findUniqueOrThrow({
        where: { id_tenantId: { id: versionId, tenantId: siteId } },
      }),
    );
    expect(version.scheduledAt).toBeNull();
    expect(version.publishedAt).toBeNull();
  });

  it("lets an authorised organisation head publish without a site membership", async () => {
    if (!app) throw new Error("E2E app did not start");
    const membership = await prisma.siteMembership.findUnique({
      where: { tenantId_userId: { tenantId: siteId, userId: orgHeadId } },
    });
    expect(membership).toBeNull();
    const trip = await request(app.getHttpServer())
      .post(`/school/sites/${siteId}/trips`)
      .set("Authorization", orgHeadAuth)
      .send(tripInput());
    expect(trip.status).toBe(201);
    const slip = await request(app.getHttpServer())
      .post(`/school/sites/${siteId}/permission-slips`)
      .set("Authorization", orgHeadAuth)
      .send({ ...slipInput(), tripId: trip.body.id });
    expect(slip.status).toBe(201);
    const published = await request(app.getHttpServer())
      .post(`/school/sites/${siteId}/permission-slips/${slip.body.id}/publish`)
      .set("Authorization", orgHeadAuth)
      .send({ expectedVersionId: slip.body.versions[0].id });
    expect(published.status).toBe(201);
    expect(published.body.versionHash).toMatch(/^[0-9a-f]{64}$/);
  });
});
