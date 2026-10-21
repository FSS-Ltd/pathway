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
import { makeSlipSnapshot, slipVersionHash } from "../permission-slip-version";

describe("ACE permission-slip responses", () => {
  const orgId = randomUUID();
  const siteId = randomUUID();
  const leaderId = randomUUID();
  const witnessId = randomUUID();
  const guardianAId = randomUUID();
  const guardianBId = randomUUID();
  const childId = randomUUID();
  const otherChildId = randomUUID();
  const yearId = randomUUID();
  const bandId = randomUUID();
  const guardianAIdentityId = randomUUID();
  const guardianBIdentityId = randomUUID();
  const relationshipAId = randomUUID();
  const relationshipBId = randomUUID();
  const oldResponseFlag = process.env.ACE_TRIP_SLIP_RESPONSE_ENABLED;
  let app: INestApplication | undefined;
  let leaderAuth = "";
  let guardianAAuth = "";
  let guardianBAuth = "";
  const roles: Array<Awaited<ReturnType<typeof seedE2eTypedRole>>> = [];

  async function createPublishedSlip(options: { expired?: boolean } = {}) {
    const now = Date.now();
    const startsAt = new Date(now + 30 * 86_400_000);
    const tripDetails = {
      title: "Museum visit",
      destination: "Science Museum",
      startsAt,
      endsAt: new Date(startsAt.getTime() + 6 * 3_600_000),
    };
    const snapshot = makeSlipSnapshot(tripDetails, {
      title: "Museum consent",
      description: "Bring lunch",
      consentText: "I consent to this school visit.",
      deadlineAt: new Date(
        now + (options.expired ? -86_400_000 : 10 * 86_400_000),
      ).toISOString(),
      questions: [{ label: "Emergency contact", required: true }],
      recipientChildIds: [childId, otherChildId],
    });
    const versionHash = slipVersionHash(snapshot);
    return withTenantRlsContext(siteId, orgId, async (tx) => {
      const trip = await tx.trip.create({
        data: {
          tenantId: siteId,
          ...tripDetails,
          createdByUserId: leaderId,
        },
      });
      const slip = await tx.permissionSlip.create({
        data: {
          tenantId: siteId,
          tripId: trip.id,
          createdByUserId: leaderId,
        },
      });
      const version = await tx.permissionSlipVersion.create({
        data: {
          tenantId: siteId,
          permissionSlipId: slip.id,
          version: 1,
          contentSnapshot: snapshot,
          createdByUserId: leaderId,
        },
      });
      await tx.permissionSlipRecipient.createMany({
        data: [childId, otherChildId].map((recipientChildId) => ({
          tenantId: siteId,
          permissionSlipVersionId: version.id,
          childId: recipientChildId,
        })),
      });
      await tx.permissionSlipVersion.update({
        where: { id_tenantId: { id: version.id, tenantId: siteId } },
        data: {
          versionHash,
          publishedAt: new Date(),
          publishedByUserId: leaderId,
        },
      });
      return { slipId: slip.id, versionId: version.id, versionHash, snapshot };
    });
  }

  function responseInput(
    version: Awaited<ReturnType<typeof createPublishedSlip>>,
    overrides: Record<string, unknown> = {},
  ) {
    return {
      childId,
      expectedVersionId: version.versionId,
      expectedVersionHash: version.versionHash,
      decision: "ACCEPTED",
      typedName: "Alex Guardian",
      signatureAcknowledged: true,
      answers: [
        {
          questionId: version.snapshot.questions[0].id,
          answer: "Alex Guardian",
        },
      ],
      idempotencyKey: randomUUID(),
      ...overrides,
    };
  }

  beforeAll(async () => {
    if (!requireDatabase())
      throw new Error("PostgreSQL is required for trip-slip response E2E");
    process.env.ACE_TRIP_SLIP_RESPONSE_ENABLED = "true";
    await prisma.org.create({
      data: {
        id: orgId,
        name: "Consent school",
        slug: `consent-${orgId}`,
        planCode: "trial",
      },
    });
    await prisma.orgVertical.create({
      data: { orgId, vertical: "ACE_SCHOOL" },
    });
    await prisma.tenant.create({
      data: {
        id: siteId,
        orgId,
        name: "Consent site",
        slug: `consent-${siteId}`,
        timezone: "Europe/London",
      },
    });
    leaderAuth = (
      await seedE2eAuthUser({
        subject: `consent-leader-${leaderId}`,
        userId: leaderId,
        tenantId: siteId,
        siteRole: "SITE_ADMIN",
        orgId,
        orgRole: "ORG_ADMIN",
      })
    ).authorization;
    await seedE2eAuthUser({
      subject: `consent-witness-${witnessId}`,
      userId: witnessId,
      tenantId: siteId,
      siteRole: "STAFF",
      orgId,
      orgRole: "ORG_MEMBER",
    });
    guardianAAuth = (
      await seedE2eAuthUser({
        subject: `consent-guardian-a-${guardianAId}`,
        userId: guardianAId,
        tenantId: siteId,
        orgId,
        orgRole: "ORG_MEMBER",
        hasFamilyAccess: true,
      })
    ).authorization;
    guardianBAuth = (
      await seedE2eAuthUser({
        subject: `consent-guardian-b-${guardianBId}`,
        userId: guardianBId,
        tenantId: siteId,
        orgId,
        orgRole: "ORG_MEMBER",
        hasFamilyAccess: true,
      })
    ).authorization;
    await prisma.userTenantRole.createMany({
      data: [guardianAId, guardianBId].map((userId) => ({
        userId,
        tenantId: siteId,
        role: "PARENT",
      })),
    });
    roles.push(
      await seedE2eTypedRole({
        orgId,
        tenantId: siteId,
        userId: leaderId,
        scope: "site",
        permissionKeys: ["school.permission_slips.manage"],
      }),
      await seedE2eTypedRole({
        orgId,
        tenantId: siteId,
        userId: guardianAId,
        scope: "site",
        permissionKeys: ["school.permission_slips.respond"],
      }),
      await seedE2eTypedRole({
        orgId,
        tenantId: siteId,
        userId: guardianBId,
        scope: "site",
        permissionKeys: ["school.permission_slips.respond"],
      }),
    );
    await withTenantRlsContext(siteId, orgId, async (tx) => {
      await tx.academicYear.create({
        data: {
          id: yearId,
          tenantId: siteId,
          name: "Consent year",
          startsOn: new Date(Date.now() - 30 * 86_400_000),
          endsOn: new Date(Date.now() + 90 * 86_400_000),
          status: "ACTIVE",
        },
      });
      await tx.aceYearBand.create({
        data: { id: bandId, tenantId: siteId, name: "Year 5" },
      });
      await tx.child.createMany({
        data: [childId, otherChildId].map((id) => ({
          id,
          tenantId: siteId,
          firstName: "Consent",
          lastName: "Pupil",
        })),
      });
      await tx.aceSchoolEnrollment.createMany({
        data: [childId, otherChildId].map((id) => ({
          tenantId: siteId,
          childId: id,
          academicYearId: yearId,
          yearBandId: bandId,
          startsOn: new Date(Date.now() - 10 * 86_400_000),
        })),
      });
      await tx.guardianIdentity.createMany({
        data: [
          { id: guardianAIdentityId, tenantId: siteId, userId: guardianAId },
          { id: guardianBIdentityId, tenantId: siteId, userId: guardianBId },
        ],
      });
      await tx.guardianChildRelationship.createMany({
        data: [
          {
            id: relationshipAId,
            tenantId: siteId,
            childId,
            guardianIdentityId: guardianAIdentityId,
            startsAt: new Date(Date.now() - 86_400_000),
          },
          {
            id: relationshipBId,
            tenantId: siteId,
            childId,
            guardianIdentityId: guardianBIdentityId,
            startsAt: new Date(Date.now() - 86_400_000),
          },
        ],
      });
    });
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (oldResponseFlag === undefined)
      delete process.env.ACE_TRIP_SLIP_RESPONSE_ENABLED;
    else process.env.ACE_TRIP_SLIP_RESPONSE_ENABLED = oldResponseFlag;
    await app?.close();
    if (!isDatabaseAvailable()) return;
    await prisma.$executeRaw`TRUNCATE TABLE "PermissionSlipReminder", "PermissionSlipException", "PermissionSlipResponse", "PermissionSlipRecipient", "PermissionSlipVersion", "PermissionSlip", "TripCheckpointAttendance", "TripCheckpoint", "Trip"`;
    await prisma.guardianChildRelationship.deleteMany({
      where: { tenantId: siteId },
    });
    await prisma.guardianIdentity.deleteMany({ where: { tenantId: siteId } });
    await prisma.aceSchoolEnrollment.deleteMany({
      where: { tenantId: siteId },
    });
    await prisma.child.deleteMany({ where: { tenantId: siteId } });
    await prisma.aceYearBand.deleteMany({ where: { tenantId: siteId } });
    await prisma.academicYear.deleteMany({ where: { tenantId: siteId } });
    await prisma.auditEvent.deleteMany({ where: { orgId } });
    for (const role of roles) await clearE2eTypedRole(role, orgId);
    await prisma.userTenantRole.deleteMany({
      where: { tenantId: siteId, userId: { in: [guardianAId, guardianBId] } },
    });
    for (const userId of [leaderId, witnessId, guardianAId, guardianBId])
      await clearE2eAuthAccess(userId);
    await prisma.user.deleteMany({
      where: { id: { in: [leaderId, witnessId, guardianAId, guardianBId] } },
    });
    await prisma.orgVertical.deleteMany({ where: { orgId } });
    await prisma.tenant.deleteMany({ where: { id: siteId } });
    await prisma.org.deleteMany({ where: { id: orgId } });
  });

  it("records encrypted, version-bound consent and returns exact retries for two guardians", async () => {
    if (!app) throw new Error("E2E app did not start");
    const version = await createPublishedSlip();
    const body = responseInput(version);
    const url = `/ace/family/sites/${siteId}/permission-slips/${version.slipId}/respond`;
    const first = await request(app.getHttpServer())
      .post(url)
      .set("Authorization", guardianAAuth)
      .set("User-Agent", "Consent test browser")
      .send(body);
    expect(first.status).toBe(201);
    expect(first.body.versionHash).toBe(version.versionHash);
    const retry = await request(app.getHttpServer())
      .post(url)
      .set("Authorization", guardianAAuth)
      .send(body);
    expect(retry.status).toBe(201);
    expect(retry.body.id).toBe(first.body.id);
    const changedRetry = await request(app.getHttpServer())
      .post(url)
      .set("Authorization", guardianAAuth)
      .send({ ...body, decision: "DECLINED" });
    expect(changedRetry.status).toBe(409);
    const second = await request(app.getHttpServer())
      .post(url)
      .set("Authorization", guardianBAuth)
      .send(
        responseInput(version, {
          decision: "DECLINED",
          typedName: "Blair Guardian",
          answers: [],
        }),
      );
    expect(second.status).toBe(201);
    expect(second.body.decision).toBe("DECLINED");
    expect(second.body.id).not.toBe(first.body.id);
    const rows = await prisma.$queryRaw<Array<{ responsePayload: string }>>`
      SELECT "responsePayload" FROM "PermissionSlipResponse"
      WHERE "permissionSlipVersionId" = ${version.versionId}
    `;
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.responsePayload.startsWith("v1:"))).toBe(
      true,
    );
    expect(rows[0].responsePayload).not.toContain("Consent test browser");
  });

  it("keeps online responses disabled until the release flag is enabled", async () => {
    if (!app) throw new Error("E2E app did not start");
    const version = await createPublishedSlip();
    delete process.env.ACE_TRIP_SLIP_RESPONSE_ENABLED;
    try {
      const response = await request(app.getHttpServer())
        .post(
          `/ace/family/sites/${siteId}/permission-slips/${version.slipId}/respond`,
        )
        .set("Authorization", guardianAAuth)
        .send(responseInput(version));
      expect(response.status).toBe(503);
    } finally {
      process.env.ACE_TRIP_SLIP_RESPONSE_ENABLED = "true";
    }
  });

  it("rejects missing answers, foreign children, ended relationships, and late responses", async () => {
    if (!app) throw new Error("E2E app did not start");
    const version = await createPublishedSlip();
    const url = `/ace/family/sites/${siteId}/permission-slips/${version.slipId}/respond`;
    const missingAnswers = await request(app.getHttpServer())
      .post(url)
      .set("Authorization", guardianAAuth)
      .send(responseInput(version, { answers: [] }));
    expect(missingAnswers.status).toBe(409);
    const foreignChild = await request(app.getHttpServer())
      .post(url)
      .set("Authorization", guardianAAuth)
      .send(responseInput(version, { childId: otherChildId }));
    expect(foreignChild.status).toBe(404);
    await prisma.guardianChildRelationship.update({
      where: { id: relationshipBId },
      data: { endedAt: new Date() },
    });
    const ended = await request(app.getHttpServer())
      .post(url)
      .set("Authorization", guardianBAuth)
      .send(responseInput(version));
    expect(ended.status).toBe(404);
    const expired = await createPublishedSlip({ expired: true });
    const late = await request(app.getHttpServer())
      .post(
        `/ace/family/sites/${siteId}/permission-slips/${expired.slipId}/respond`,
      )
      .set("Authorization", guardianAAuth)
      .send(responseInput(expired));
    expect(late.status).toBe(409);
    await prisma.guardianChildRelationship.update({
      where: { id: relationshipBId },
      data: { endedAt: null },
    });
  });

  it("rejects a replaced version and accepts explicit reconsent to its successor", async () => {
    if (!app) throw new Error("E2E app did not start");
    const first = await createPublishedSlip();
    const successorSnapshot = {
      ...first.snapshot,
      consentText: "I consent to the revised school visit.",
    };
    const successorHash = slipVersionHash(successorSnapshot);
    const successor = await withTenantRlsContext(siteId, orgId, async (tx) => {
      const version = await tx.permissionSlipVersion.create({
        data: {
          tenantId: siteId,
          permissionSlipId: first.slipId,
          version: 2,
          contentSnapshot: successorSnapshot,
          changeClassification: "MATERIAL",
          requiresReconsent: true,
          supersedesVersionId: first.versionId,
          createdByUserId: leaderId,
        },
      });
      await tx.permissionSlipRecipient.createMany({
        data: [childId, otherChildId].map((recipientChildId) => ({
          tenantId: siteId,
          permissionSlipVersionId: version.id,
          childId: recipientChildId,
        })),
      });
      await tx.permissionSlipVersion.update({
        where: { id_tenantId: { id: version.id, tenantId: siteId } },
        data: {
          versionHash: successorHash,
          publishedAt: new Date(),
          publishedByUserId: leaderId,
        },
      });
      return {
        ...first,
        versionId: version.id,
        versionHash: successorHash,
        snapshot: successorSnapshot,
      };
    });
    const url = `/ace/family/sites/${siteId}/permission-slips/${first.slipId}/respond`;
    const stale = await request(app.getHttpServer())
      .post(url)
      .set("Authorization", guardianAAuth)
      .send(responseInput(first));
    expect(stale.status).toBe(409);
    const renewed = await request(app.getHttpServer())
      .post(url)
      .set("Authorization", guardianAAuth)
      .send(responseInput(successor));
    expect(renewed.status).toBe(201);
    expect(renewed.body.versionHash).toBe(successorHash);
  });

  it("records a witnessed, encrypted physical exception and blocks conflicting online consent", async () => {
    if (!app) throw new Error("E2E app did not start");
    const version = await createPublishedSlip();
    const exceptionUrl = `/school/sites/${siteId}/permission-slips/${version.slipId}/exceptions`;
    const body = {
      childId,
      expectedVersionId: version.versionId,
      expectedVersionHash: version.versionHash,
      decision: "ACCEPTED",
      source: "PHYSICAL",
      reason: "Signed paper form received by the school office.",
      witnessUserId: witnessId,
    };
    const selfWitness = await request(app.getHttpServer())
      .post(exceptionUrl)
      .set("Authorization", leaderAuth)
      .send({ ...body, witnessUserId: leaderId });
    expect(selfWitness.status).toBe(409);
    const recorded = await request(app.getHttpServer())
      .post(exceptionUrl)
      .set("Authorization", leaderAuth)
      .send(body);
    expect(recorded.status).toBe(201);
    expect(recorded.body.versionHash).toBe(version.versionHash);
    const duplicate = await request(app.getHttpServer())
      .post(exceptionUrl)
      .set("Authorization", leaderAuth)
      .send(body);
    expect(duplicate.status).toBe(409);
    const online = await request(app.getHttpServer())
      .post(
        `/ace/family/sites/${siteId}/permission-slips/${version.slipId}/respond`,
      )
      .set("Authorization", guardianAAuth)
      .send(responseInput(version));
    expect(online.status).toBe(409);
    const rows = await prisma.$queryRaw<Array<{ reason: string }>>`
      SELECT "reason" FROM "PermissionSlipException" WHERE "id" = ${recorded.body.id}
    `;
    expect(rows[0].reason.startsWith("v1:")).toBe(true);
    expect(rows[0].reason).not.toContain("Signed paper form");
  });
});
