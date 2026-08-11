import { randomUUID } from "node:crypto";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Prisma, prisma, withTenantRlsContext } from "@pathway/db";
import request from "supertest";
import { AppModule } from "../../app.module";
import {
  clearE2eAuthAccess,
  clearE2eTypedRole,
  requireDatabase,
  seedE2eAuthUser,
  seedE2eTypedRole,
} from "../../../test-helpers.e2e";

const TENANT_RLS_ROLE = "pathway_e2e_tenant_rls";

interface PaceRosterFixture {
  childAId: string;
  childBId: string;
  subjectAId: string;
  subjectBId: string;
  enrollmentAId: string;
  enrollmentBId: string;
  progressAId: string;
  progressBId: string;
  writerBId: string;
}

function useTenantRlsRole(): boolean {
  return process.env.E2E_USE_GLOBAL_SETUP === "true";
}

async function withPaceRlsContext<T>(
  tenantId: string,
  orgId: string,
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return withTenantRlsContext(tenantId, orgId, async (tx) => {
    if (useTenantRlsRole()) {
      await tx.$executeRawUnsafe(`SET LOCAL ROLE "${TENANT_RLS_ROLE}"`);
    }
    return callback(tx);
  });
}

describe("ACE PACE roster RLS", () => {
  let app: INestApplication | undefined;
  const orgId = process.env.E2E_ORG_ID as string;
  const tenantAId = process.env.E2E_TENANT_ID as string;
  const tenantBId = process.env.E2E_TENANT2_ID as string;
  let authHeader = "";
  let authUserId = "";
  let typedRole: Awaited<ReturnType<typeof seedE2eTypedRole>> | undefined;
  let fixture: PaceRosterFixture | undefined;
  let createdOrgVertical = false;

  beforeAll(async () => {
    if (!requireDatabase()) return;
    if (!orgId || !tenantAId || !tenantBId) {
      throw new Error("E2E tenant fixtures are not configured");
    }

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    const vertical = await prisma.orgVertical.findUnique({ where: { orgId } });
    if (!vertical) {
      await prisma.orgVertical.create({
        data: { orgId, vertical: "ACE_SCHOOL" },
      });
      createdOrgVertical = true;
    }

    const auth = await seedE2eAuthUser({
      subject: `pace-roster-${randomUUID()}`,
      tenantId: tenantAId,
      siteRole: "SITE_ADMIN",
      orgId,
      orgRole: "ORG_ADMIN",
    });
    authHeader = auth.authorization;
    authUserId = auth.userId;
    typedRole = await seedE2eTypedRole({
      orgId,
      tenantId: tenantAId,
      userId: authUserId,
      scope: "site",
      permissionKeys: ["ace.pace.read"],
    });

    fixture = await createFixture({
      orgId,
      tenantAId,
      tenantBId,
      writerAId: authUserId,
    });
  });

  afterAll(async () => {
    if (!fixture) return;
    await cleanupFixture(fixture);
    if (typedRole) await clearE2eTypedRole(typedRole, orgId);
    if (authUserId) {
      await clearE2eAuthAccess(authUserId);
      await prisma.user.deleteMany({ where: { id: authUserId } });
    }
    if (createdOrgVertical) {
      await prisma.orgVertical.deleteMany({ where: { orgId } });
    }
    await app?.close();
  });

  it("does not return another site's roster row to an active site A request", async () => {
    if (!app || !fixture) return;

    const response = await request(app.getHttpServer())
      .get("/ace/pace/roster")
      .set("Authorization", authHeader);

    expect(response.status).toBe(200);
    expect(response.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          child: expect.objectContaining({ id: fixture.childAId }),
        }),
      ]),
    );
    expect(response.body.items).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          child: expect.objectContaining({ id: fixture.childBId }),
        }),
      ]),
    );
  });

  it("returns 404 for another site's child-progress endpoint", async () => {
    if (!app || !fixture) return;

    const response = await request(app.getHttpServer())
      .get(`/ace/students/${fixture.childBId}/pace`)
      .set("Authorization", authHeader);

    expect(response.status).toBe(404);
  });
});

async function createFixture(input: {
  orgId: string;
  tenantAId: string;
  tenantBId: string;
  writerAId: string;
}): Promise<PaceRosterFixture> {
  const fixture = {
    childAId: randomUUID(),
    childBId: randomUUID(),
    subjectAId: randomUUID(),
    subjectBId: randomUUID(),
    enrollmentAId: randomUUID(),
    enrollmentBId: randomUUID(),
    progressAId: randomUUID(),
    progressBId: randomUUID(),
    writerBId: randomUUID(),
  };
  await withPaceRlsContext(input.tenantAId, input.orgId, async (tx) => {
    await tx.child.create({
      data: {
        id: fixture.childAId,
        tenantId: input.tenantAId,
        firstName: "PACE",
        lastName: "Site A",
      },
    });
    await tx.subject.create({
      data: {
        id: fixture.subjectAId,
        tenantId: input.tenantAId,
        name: `PACE subject A ${fixture.subjectAId}`,
      },
    });
    await tx.studentSubjectEnrollment.create({
      data: {
        id: fixture.enrollmentAId,
        tenantId: input.tenantAId,
        childId: fixture.childAId,
        subjectId: fixture.subjectAId,
        startsOn: new Date("2026-09-01T00:00:00.000Z"),
        status: "ACTIVE",
        startingPace: 1,
        currentPace: 1,
        targetPace: 12,
        recordedByUserId: input.writerAId,
        reason: "PACE roster RLS fixture",
      },
    });
    await tx.paceProgress.create({
      data: {
        id: fixture.progressAId,
        tenantId: input.tenantAId,
        childId: fixture.childAId,
        subjectId: fixture.subjectAId,
        currentPace: 1,
        targetPace: 12,
        trackStatus: "ON_TRACK",
        rebuiltAt: new Date("2026-09-02T00:00:00.000Z"),
      },
    });
  });
  // A site membership cannot be self-created while exercising the restricted
  // tenant role. Seed this bootstrap relationship outside the role, then use
  // the actual tenant RLS role for the PACE fixture rows below.
  await withTenantRlsContext(input.tenantBId, input.orgId, async (tx) => {
    await tx.user.create({
      data: {
        id: fixture.writerBId,
        email: `${fixture.writerBId}@example.test`,
        tenantId: input.tenantBId,
      },
    });
    await tx.siteMembership.create({
      data: { tenantId: input.tenantBId, userId: fixture.writerBId },
    });
  });
  await withPaceRlsContext(input.tenantBId, input.orgId, async (tx) => {
    await tx.child.create({
      data: {
        id: fixture.childBId,
        tenantId: input.tenantBId,
        firstName: "PACE",
        lastName: "Site B",
      },
    });
    await tx.subject.create({
      data: {
        id: fixture.subjectBId,
        tenantId: input.tenantBId,
        name: `PACE subject B ${fixture.subjectBId}`,
      },
    });
    await tx.studentSubjectEnrollment.create({
      data: {
        id: fixture.enrollmentBId,
        tenantId: input.tenantBId,
        childId: fixture.childBId,
        subjectId: fixture.subjectBId,
        startsOn: new Date("2026-09-01T00:00:00.000Z"),
        status: "ACTIVE",
        startingPace: 1,
        currentPace: 1,
        targetPace: 12,
        recordedByUserId: fixture.writerBId,
        reason: "PACE roster RLS fixture",
      },
    });
    await tx.paceProgress.create({
      data: {
        id: fixture.progressBId,
        tenantId: input.tenantBId,
        childId: fixture.childBId,
        subjectId: fixture.subjectBId,
        currentPace: 1,
        targetPace: 12,
        trackStatus: "ON_TRACK",
        rebuiltAt: new Date("2026-09-02T00:00:00.000Z"),
      },
    });
  });
  return fixture;
}

async function cleanupFixture(fixture: PaceRosterFixture): Promise<void> {
  await prisma.paceProgress.deleteMany({
    where: { id: { in: [fixture.progressAId, fixture.progressBId] } },
  });
  await prisma.studentSubjectEnrollment.deleteMany({
    where: { id: { in: [fixture.enrollmentAId, fixture.enrollmentBId] } },
  });
  await prisma.subject.deleteMany({
    where: { id: { in: [fixture.subjectAId, fixture.subjectBId] } },
  });
  await prisma.child.deleteMany({
    where: { id: { in: [fixture.childAId, fixture.childBId] } },
  });
  await prisma.siteMembership.deleteMany({ where: { userId: fixture.writerBId } });
  await prisma.user.deleteMany({ where: { id: fixture.writerBId } });
}
