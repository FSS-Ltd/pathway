import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { prisma, withTenantRlsContext } from "@pathway/db";
import request from "supertest";
import {
  requireDatabase,
  seedE2eAuthUser,
  seedE2eTypedRole,
} from "../../../test-helpers.e2e";
import { AppModule } from "../../app.module";
import { TrackerProfileService } from "../tracker-profile.service";
import { normalizeTrackerProfile } from "../tracker.dto";
import { testProfile } from "./tracker-fixture";

describe("Legacy site profile facts persistence", () => {
  const orgId = randomUUID(),
    tenantId = randomUUID(),
    userId = randomUUID();
  const actor = { orgId, tenantId, userId };
  let app: INestApplication | undefined;
  let authorization = "";
  beforeAll(async () => {
    if (!requireDatabase()) return;
    await prisma.org.create({
      data: {
        id: orgId,
        name: "Legacy profile test",
        slug: `facts-${orgId}`,
        planCode: "trial",
      },
    });
    await prisma.orgVertical.create({
      data: { orgId, vertical: "ACE_SCHOOL" },
    });
    await prisma.tenant.create({
      data: {
        id: tenantId,
        orgId,
        name: "Facts site",
        slug: `facts-${tenantId}`,
        timezone: "Europe/London",
      },
    });
    ({ authorization } = await seedE2eAuthUser({
      subject: `facts-${userId}`,
      userId,
      tenantId,
      orgId,
      siteRole: "STAFF",
      orgRole: "ORG_MEMBER",
      name: "Facts tester",
    }));
    await seedE2eTypedRole({
      orgId,
      tenantId,
      userId,
      scope: "site",
      permissionKeys: ["compliance.tracker.read", "compliance.tracker.manage"],
    });
    await withTenantRlsContext(tenantId, orgId, async (tx) => {
      const row = await tx.complianceSiteProfile.create({
        data: {
          orgId,
          tenantId,
          jurisdictionId: testProfile.jurisdictionId,
          version: 1,
          profileJson: JSON.stringify(testProfile),
          updatedByUserId: userId,
        },
      });
      await tx.complianceProfileRevision.create({
        data: {
          orgId,
          tenantId,
          profileId: row.id,
          version: 1,
          profileJson: JSON.stringify(testProfile),
          createdByUserId: userId,
        },
      });
    });
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterAll(async () => {
    if (app) await app.close();
  });
  it("normalizes legacy reads and preserves revision on HTTP and direct-service unchanged saves", async () => {
    if (!app) return;
    const read = await request(app.getHttpServer())
      .get("/compliance/tracker/profile")
      .set("Authorization", authorization)
      .expect(200);
    expect(read.body.profile).toEqual(normalizeTrackerProfile(testProfile));
    const saved = await request(app.getHttpServer())
      .put("/compliance/tracker/profile")
      .set("Authorization", authorization)
      .send({ expectedVersion: 1, profile: testProfile })
      .expect(200);
    expect(saved.body).toEqual(read.body);
    expect(
      await app
        .get(TrackerProfileService)
        .save(actor, { expectedVersion: 1, profile: testProfile }),
    ).toEqual(read.body);
    const revisions = await withTenantRlsContext(tenantId, orgId, (tx) =>
      tx.complianceProfileRevision.count({ where: { tenantId, orgId } }),
    );
    expect(revisions).toBe(1);
  });
  it("persists explicit false facts and rejects contradictory school categories without a revision", async () => {
    if (!app) return;
    await request(app.getHttpServer())
      .put("/compliance/tracker/profile")
      .set("Authorization", authorization)
      .send({
        expectedVersion: 1,
        profile: { ...testProfile, schoolCategory: "ACADEMY" },
      })
      .expect(400);
    const profile = {
      ...testProfile,
      englandSchoolMedicalDutiesApply: false,
      personalDataController: true,
      employsStaff: false,
      controlsPremises: true,
      foodBusiness: false,
      operatesVehicles: false,
      eyfsApplies: false,
      schoolCategory: "INDEPENDENT",
    };
    await request(app.getHttpServer())
      .put("/compliance/tracker/profile")
      .set("Authorization", authorization)
      .send({ expectedVersion: 1, profile })
      .expect(200);
    const read = await request(app.getHttpServer())
      .get("/compliance/tracker/profile")
      .set("Authorization", authorization)
      .expect(200);
    expect(read.body.profile).toEqual(normalizeTrackerProfile(profile));
    expect(read.body.version).toBe(2);
  });
  it("preserves enriched facts for legacy writes and rejects contradictory merged profiles", async () => {
    if (!app) return;
    const server = app.getHttpServer();
    const before = await request(server)
      .get("/compliance/tracker/profile")
      .set("Authorization", authorization)
      .expect(200);
    const legacy = { ...testProfile, region: "Changed by legacy client" };
    const changed = await request(server)
      .put("/compliance/tracker/profile")
      .set("Authorization", authorization)
      .send({ expectedVersion: 2, profile: legacy })
      .expect(200);
    expect(changed.body.profile).toEqual({
      ...before.body.profile,
      region: legacy.region,
    });
    expect(changed.body.version).toBe(3);
    const unchanged = await request(server)
      .put("/compliance/tracker/profile")
      .set("Authorization", authorization)
      .send({ expectedVersion: 3, profile: legacy })
      .expect(200);
    expect(unchanged.body).toEqual(changed.body);
    const invalid = await request(server)
      .put("/compliance/tracker/profile")
      .set("Authorization", authorization)
      .send({
        expectedVersion: 3,
        profile: { ...legacy, providerCategory: "STATE_SCHOOL" },
      })
      .expect(400);
    expect(JSON.stringify(invalid.body)).toContain(
      "Review the saved school category",
    );
    const after = await request(server)
      .get("/compliance/tracker/profile")
      .set("Authorization", authorization)
      .expect(200);
    expect(after.body).toEqual(changed.body);
    const cleared = await request(server)
      .put("/compliance/tracker/profile")
      .set("Authorization", authorization)
      .send({
        expectedVersion: 3,
        profile: { ...legacy, schoolCategory: null, employsStaff: null },
      })
      .expect(200);
    expect(cleared.body.profile).toEqual({
      ...changed.body.profile,
      schoolCategory: null,
      employsStaff: null,
    });
    expect(cleared.body.version).toBe(4);
    const revisions = await withTenantRlsContext(tenantId, orgId, (tx) =>
      tx.complianceProfileRevision.count({ where: { tenantId, orgId } }),
    );
    expect(revisions).toBe(4);
  });
});
