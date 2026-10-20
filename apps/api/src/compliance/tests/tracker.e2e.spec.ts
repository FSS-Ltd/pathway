import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { prisma, withTenantRlsContext } from "@pathway/db";
import type {
  TrackerProfileInput,
  TrackerAttestationInput,
  TrackerSignal,
} from "@pathway/types";
import { isEncryptedField } from "@pathway/util";
import request from "supertest";
import {
  requireDatabase,
  seedE2eAuthUser,
  seedE2eTypedRole,
} from "../../../test-helpers.e2e";
import { AppModule } from "../../app.module";
import { TrackerCatalogueService } from "../catalogue/catalogue.service";
import { TRACKER_CATALOGUE } from "../catalogue";
import { normalizeTrackerProfile } from "../tracker.dto";
import { TrackerProfileService } from "../tracker-profile.service";
import { TrackerService } from "../tracker.service";
import { SupabaseStorageService } from "../../common/storage/supabase-storage.service";
import * as audit from "../../audit/audit.service";
import { testProfile, trackerFixture } from "./tracker-fixture";

describe("Site tracker persistence and permission boundaries", () => {
  const orgId = randomUUID(),
    siteId = randomUUID(),
    otherSiteId = randomUUID(),
    foreignOrg = randomUUID(),
    foreignSite = randomUUID(),
    managerId = randomUUID();
  const actor = { orgId, tenantId: siteId, userId: managerId };
  let app: INestApplication | undefined;
  let manager = "",
    reader = "",
    ordinary = "",
    other = "",
    foreign = "";
  const catalogueProvider = { catalogue: trackerFixture() };
  const files = new Map<string, Buffer>();
  const upload = jest.fn(async (input: { key: string; body: Buffer }) => {
    files.set(input.key, Buffer.from(input.body));
    return { key: input.key };
  });
  const download = jest.fn(
    async (_bucket: string, key: string) => files.get(key) ?? null,
  );
  let oldBucket: string | undefined;
  beforeAll(async () => {
    if (!requireDatabase()) return;
    oldBucket = process.env.SUPABASE_STORAGE_PRIVATE_BUCKET;
    process.env.SUPABASE_STORAGE_PRIVATE_BUCKET = "tracker-test-private";
    for (const id of [orgId, foreignOrg]) {
      await prisma.org.create({
        data: {
          id,
          name: "Tracker test",
          slug: `tracker-${id}`,
          planCode: "trial",
        },
      });
      await prisma.orgVertical.create({
        data: { orgId: id, vertical: "ACE_SCHOOL" },
      });
    }
    await prisma.tenant.createMany({
      data: [siteId, otherSiteId, foreignSite].map((id) => ({
        id,
        orgId: id === foreignSite ? foreignOrg : orgId,
        name: "Tracker site",
        slug: `tracker-${id}`,
        timezone: "Europe/London",
      })),
    });
    const tokens: string[] = [];
    for (const [userId, tenantId, permissionKeys] of [
      [
        managerId,
        siteId,
        [
          "compliance.tracker.read",
          "compliance.tracker.manage",
          "compliance.checks.read",
        ],
      ],
      [randomUUID(), siteId, ["compliance.tracker.read"]],
      [randomUUID(), siteId, []],
      [
        randomUUID(),
        otherSiteId,
        ["compliance.tracker.read", "compliance.tracker.manage"],
      ],
      [
        randomUUID(),
        foreignSite,
        ["compliance.tracker.read", "compliance.tracker.manage"],
      ],
    ] as const) {
      const scopeOrg = tenantId === foreignSite ? foreignOrg : orgId;
      const auth = await seedE2eAuthUser({
        subject: `tracker-${userId}`,
        userId,
        tenantId,
        orgId: scopeOrg,
        siteRole: "STAFF",
        orgRole: "ORG_MEMBER",
        name: "Tracker tester",
      });
      if (permissionKeys.length)
        await seedE2eTypedRole({
          orgId: scopeOrg,
          tenantId,
          userId,
          scope: "site",
          permissionKeys,
        });
      tokens.push(auth.authorization);
    }
    [manager, reader, ordinary, other, foreign] = tokens;
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(TrackerCatalogueService)
      .useValue(catalogueProvider)
      .overrideProvider(SupabaseStorageService)
      .useValue({
        uploadObject: upload,
        downloadObject: download,
        isConfigured: () => true,
      })
      .compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterAll(async () => {
    if (app) await app.close();
    if (oldBucket === undefined)
      delete process.env.SUPABASE_STORAGE_PRIVATE_BUCKET;
    else process.env.SUPABASE_STORAGE_PRIVATE_BUCKET = oldBucket;
  });
  async function save(profile: TrackerProfileInput = testProfile) {
    const service = app!.get(TrackerProfileService);
    const current = await service.get(actor);
    return service.save(actor, {
      expectedVersion: current?.version ?? 0,
      profile,
    });
  }
  async function confirmation(
    overrides: Partial<TrackerAttestationInput> = {},
  ): Promise<TrackerAttestationInput> {
    const service = app!.get(TrackerService);
    const current = await app!.get(TrackerProfileService).get(actor);
    const history = await service.history(
      actor,
      overrides.requirementId ?? "test-duty",
    );
    return {
      requirementId: "test-duty",
      requirementVersion: 1,
      profileVersion: current!.version,
      expectedRevision: Math.max(
        0,
        ...history.items.map((row) => row.revision),
      ),
      status: "COMPLETE",
      notes: "Private confirmation",
      notApplicableReason: null,
      reviewDueAt: null,
      ...overrides,
    };
  }
  it("saves unknown location without selecting England; validates profile, serializes first writes, encrypts immutable snapshots", async () => {
    if (!app) return;
    const server = app.getHttpServer();
    await request(server)
      .get("/compliance/tracker/profile")
      .set("Authorization", reader)
      .expect("Cache-Control", "private, no-store")
      .expect(200);
    const beforeProfile = await request(server)
      .get("/compliance/tracker/checklist")
      .set("Authorization", reader)
      .expect(200);
    expect(beforeProfile.body.profile).toBeNull();
    expect(beforeProfile.body.organisationFacts).toEqual({
      sector: "SCHOOL",
      vertical: "ACE_SCHOOL",
      ace: true,
    });
    expect(beforeProfile.body.coverage).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sector: "SCHOOL", jurisdiction: null }),
      ]),
    );
    const results = await Promise.all(
      [1, 2].map(() =>
        request(server)
          .put("/compliance/tracker/profile")
          .set("Authorization", manager)
          .send({
            expectedVersion: 0,
            profile: { ...testProfile, jurisdictionId: null },
          }),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    let list = await request(server)
      .get("/compliance/tracker/checklist")
      .set("Authorization", reader)
      .expect(200);
    expect(list.body.items).toEqual([]);
    expect(list.body.coverageGaps).toBe(8);
    await save({
      ...testProfile,
      jurisdictionId: "a0000000-0000-4000-8000-000000000001",
    });
    list = await request(server)
      .get("/compliance/tracker/checklist")
      .set("Authorization", reader)
      .expect(200);
    expect(list.body.items).toEqual([]);
    const saved = await save();
    expect((await app.get(TrackerProfileService).get(actor))?.profile).toEqual(
      normalizeTrackerProfile(testProfile),
    );
    await request(server)
      .put("/compliance/tracker/profile")
      .set("Authorization", manager)
      .send({
        expectedVersion: saved.version,
        profile: { ...testProfile, sector: "CLUB" },
      })
      .expect(400);
    await request(server)
      .put("/compliance/tracker/profile")
      .set("Authorization", manager)
      .send({
        expectedVersion: saved.version,
        profile: testProfile,
        tenantId: otherSiteId,
      })
      .expect(400);
    const raw = await prisma.$queryRaw<
      { profileJson: string }[]
    >`SELECT "profileJson" FROM "ComplianceProfileRevision" WHERE "tenantId"=${siteId}`;
    expect(raw.length).toBe(3);
    expect(raw.every((row) => isEncryptedField(row.profileJson))).toBe(true);
    await expect(
      prisma.complianceProfileRevision.updateMany({
        where: { tenantId: siteId },
        data: { profileJson: "tampered" },
      }),
    ).rejects.toThrow();
    const jurisdictions = await request(server)
      .get("/compliance/tracker/jurisdictions")
      .set("Authorization", reader)
      .expect(200);
    expect(
      jurisdictions.body.filter(
        (j: { level: string; countryCode: string }) =>
          j.level === "COUNTRY" && j.countryCode !== "GB",
      ).length,
    ).toBeGreaterThanOrEqual(27);
  });
  it("persists manual confirmation, prevents concurrent overwrite, supports allowed exceptions and rejects unconditional dismissal", async () => {
    if (!app) return;
    const server = app.getHttpServer();
    const input = await confirmation();
    const responses = await Promise.all(
      [1, 2].map(() =>
        request(server)
          .post("/compliance/tracker/attestations")
          .set("Authorization", manager)
          .send(input),
      ),
    );
    expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
    let checklist = await app.get(TrackerService).checklist(actor);
    expect(checklist.progress).toMatchObject({ completed: 1, applicable: 2 });
    const savedBefore = await app.get(TrackerProfileService).get(actor);
    expect(await save()).toEqual(savedBefore);
    const unchanged = await app.get(TrackerService).checklist(actor);
    expect(unchanged.progress.completed).toBe(1);
    expect(
      unchanged.items.find((item) => item.requirement.id === "test-duty")
        ?.stale,
    ).toBe(false);
    await request(server)
      .post("/compliance/tracker/attestations")
      .set("Authorization", manager)
      .send(
        await confirmation({
          status: "NOT_APPLICABLE",
          notApplicableReason: "Private allowed exception",
        }),
      )
      .expect(201);
    checklist = await app.get(TrackerService).checklist(actor);
    expect(checklist.progress).toMatchObject({
      completed: 0,
      applicable: 1,
      notApplicable: 1,
    });
    await request(server)
      .post("/compliance/tracker/attestations")
      .set("Authorization", manager)
      .send(
        await confirmation({
          requirementId: "unconditional-duty",
          status: "NOT_APPLICABLE",
          notApplicableReason: "Not allowed",
        }),
      )
      .expect(400);
    const history = await app.get(TrackerService).history(actor, "test-duty");
    expect(history.items).toHaveLength(2);
    expect(history.items[0].requirement.action).toBe("Synthetic review action");
    const raw = await prisma.$queryRaw<
      { notes: string; notApplicableReason: string | null }[]
    >`SELECT notes,"notApplicableReason" FROM "ComplianceAttestation" WHERE "tenantId"=${siteId}`;
    expect(raw.every((row) => isEncryptedField(row.notes))).toBe(true);
    expect(
      raw
        .filter((row) => row.notApplicableReason)
        .every((row) => isEncryptedField(row.notApplicableReason!)),
    ).toBe(true);
    await expect(
      prisma.complianceAttestation.deleteMany({ where: { tenantId: siteId } }),
    ).rejects.toThrow();
  });
  it("requires renewed confirmation on profile and requirement changes, separates overdue and unavailable packs", async () => {
    if (!app) return;
    const service = app.get(TrackerService);
    const old = await confirmation();
    await save({ ...testProfile, region: "Updated region" });
    await request(app.getHttpServer())
      .post("/compliance/tracker/attestations")
      .set("Authorization", manager)
      .send(old)
      .expect(409);
    expect((await service.checklist(actor)).progress).toMatchObject({
      stale: 1,
      completed: 0,
    });
    await service.attest(
      actor,
      await confirmation({ reviewDueAt: "2000-01-01" }),
    );
    expect((await service.checklist(actor)).progress.overdue).toBe(1);
    await service.attest(actor, await confirmation());
    const first = catalogueProvider.catalogue.requirements[0]!;
    catalogueProvider.catalogue.requirements.push({
      ...first,
      version: 2,
      supersedesVersion: 1,
      action: "Changed synthetic action",
    });
    expect((await service.checklist(actor)).progress).toMatchObject({
      stale: 1,
      completed: 0,
    });
    await request(app.getHttpServer())
      .post("/compliance/tracker/attestations")
      .set("Authorization", manager)
      .send(await confirmation())
      .expect(400);
    catalogueProvider.catalogue = TRACKER_CATALOGUE;
    const retained = await request(app.getHttpServer())
      .get("/compliance/tracker/history/requirements")
      .set("Authorization", reader)
      .expect(200);
    expect(retained.body.items).toContainEqual({
      requirementId: "test-duty",
      requirementVersion: 1,
      action: "Synthetic review action",
    });
    await save({ ...testProfile, jurisdictionId: null });
    const moved = await request(app.getHttpServer())
      .get("/compliance/tracker/history/requirements")
      .set("Authorization", reader)
      .expect(200);
    expect(moved.body).toEqual(retained.body);
    const empty = await service.checklist(actor);
    expect(empty.items).toEqual([]);
    expect(empty.coverageGaps).toBe(8);
    expect(
      (await service.history(actor, "test-duty")).items.length,
    ).toBeGreaterThan(0);
    catalogueProvider.catalogue = trackerFixture();
    await save();
  });
  it("persists a published Welsh confirmation after reload and isolates it from another site", async () => {
    if (!app) return;
    catalogueProvider.catalogue = TRACKER_CATALOGUE;
    try {
      const profile = await save({
        ...testProfile,
        jurisdictionId: "a0000000-0000-4000-8000-000000000003",
        localAuthority: "Cardiff",
        icce: false,
      });
      const service = app.get(TrackerService);
      const before = await service.checklist(actor);
      expect(before.items.length).toBeGreaterThan(0);
      expect(
        before.items.every((item) => /^(wal|wls)/.test(item.requirement.id)),
      ).toBe(true);
      expect(before.coverageGaps).toBe(8);
      await request(app.getHttpServer())
        .post("/compliance/tracker/attestations")
        .set("Authorization", manager)
        .send({
          requirementId: "wal.independent-registration",
          requirementVersion: 1,
          profileVersion: profile.version,
          expectedRevision: 0,
          status: "COMPLETE",
          notes: "Synthetic Welsh registration evidence reviewed",
          notApplicableReason: null,
          reviewDueAt: null,
        })
        .expect(201);
      const reloaded = await service.checklist(actor);
      expect(
        reloaded.items.find(
          (item) => item.requirement.id === "wal.independent-registration",
        ),
      ).toMatchObject({ completed: true });
      expect(reloaded.progress.completed).toBe(before.progress.completed + 1);
      await request(app.getHttpServer())
        .get(
          "/compliance/tracker/history?requirementId=wal.independent-registration",
        )
        .set("Authorization", other)
        .expect(200)
        .expect((response) => expect(response.body.items).toEqual([]));
      await request(app.getHttpServer())
        .get(
          "/compliance/tracker/history?requirementId=wal.independent-registration",
        )
        .set("Authorization", foreign)
        .expect(200)
        .expect((response) => expect(response.body.items).toEqual([]));
    } finally {
      catalogueProvider.catalogue = trackerFixture();
      await save();
    }
  });
  it("enforces read/manage, cross-site, cross-org and scoped cursor boundaries", async () => {
    if (!app) return;
    const server = app.getHttpServer();
    const history = await app.get(TrackerService).history(actor, "test-duty");
    const cursor = history.items[0].id;
    for (const path of [
      "profile",
      "checklist",
      "jurisdictions",
      "signals",
      "history?requirementId=test-duty",
      "history/requirements",
      "evidence?requirementId=test-duty",
    ])
      await request(server)
        .get(`/compliance/tracker/${path}`)
        .set("Authorization", ordinary)
        .expect(403);
    await request(server)
      .post("/compliance/tracker/attestations")
      .set("Authorization", reader)
      .send(await confirmation())
      .expect(403);
    await request(server)
      .put("/compliance/tracker/profile")
      .set("Authorization", reader)
      .send({ expectedVersion: 0, profile: testProfile })
      .expect(403);
    for (const token of [other, foreign]) {
      const index = await request(server)
        .get("/compliance/tracker/history/requirements")
        .set("Authorization", token)
        .expect(200);
      expect(index.body.items).toEqual([]);
      await request(server)
        .get("/compliance/tracker/history/requirements?cursor=test-duty")
        .set("Authorization", token)
        .expect(404);
      const read = await request(server)
        .get("/compliance/tracker/history?requirementId=test-duty")
        .set("Authorization", token)
        .expect(200);
      expect(read.body.items).toEqual([]);
      await request(server)
        .get(
          `/compliance/tracker/history?requirementId=test-duty&cursor=${cursor}`,
        )
        .set("Authorization", token)
        .expect(404);
    }
    const scoped = await withTenantRlsContext(
      otherSiteId,
      orgId,
      async (tx) => {
        await tx.$executeRawUnsafe('SET LOCAL ROLE "pathway_e2e_tenant_rls"');
        return tx.complianceAttestation.findMany({
          where: { tenantId: siteId },
        });
      },
    );
    expect(scoped).toEqual([]);
  });
  it("rolls back profile and confirmation when audit persistence fails", async () => {
    if (!app) return;
    const profiles = app.get(TrackerProfileService);
    const before = await profiles.get(actor);
    const failure = jest
      .spyOn(audit, "recordAuditEventInTransaction")
      .mockRejectedValueOnce(new Error("Synthetic audit failure"));
    try {
      await expect(
        profiles.save(actor, {
          expectedVersion: before!.version,
          profile: { ...testProfile, region: "Not saved" },
        }),
      ).rejects.toThrow("Synthetic audit failure");
    } finally {
      failure.mockRestore();
    }
    expect(await profiles.get(actor)).toEqual(before);
    const service = app.get(TrackerService);
    const historyBefore = await service.history(actor, "test-duty");
    const input = await confirmation();
    const auditFailure = jest
      .spyOn(audit, "recordAuditEventInTransaction")
      .mockRejectedValueOnce(new Error("Synthetic confirmation audit failure"));
    try {
      await expect(service.attest(actor, input)).rejects.toThrow(
        "Synthetic confirmation audit failure",
      );
    } finally {
      auditFailure.mockRestore();
    }
    expect(await service.history(actor, "test-duty")).toEqual(historyBefore);
  });
  it("keeps unknown classification unresolved and denies institutional access to Home", async () => {
    if (!app) return;
    await save({ ...testProfile, providerCategory: null });
    const unresolved = await app.get(TrackerService).checklist(actor);
    expect(unresolved.progress.unresolved).toBe(1);
    await request(app.getHttpServer())
      .post("/compliance/tracker/attestations")
      .set("Authorization", manager)
      .send(await confirmation())
      .expect(400);
    await save();
    await prisma.orgVertical.updateMany({
      where: { orgId: foreignOrg },
      data: { vertical: "HOME_EDUCATION" },
    });
    await request(app.getHttpServer())
      .get("/compliance/tracker/profile")
      .set("Authorization", foreign)
      .expect(403);
  });
  it("returns permission-safe live evidence without changing manual history", async () => {
    if (!app) return;
    const server = app.getHttpServer();
    const hidden = await request(server)
      .get("/compliance/tracker/signals")
      .set("Authorization", reader)
      .expect(200);
    expect(hidden.body).toHaveLength(7);
    expect(
      hidden.body.every(
        (signal: TrackerSignal) =>
          signal.status === "UNKNOWN" &&
          signal.count === null &&
          signal.href === null,
      ),
    ).toBe(true);
    const before = await app.get(TrackerService).history(actor, "test-duty");
    const initial = await request(server)
      .get("/compliance/tracker/signals")
      .set("Authorization", manager)
      .expect(200);
    const signal = (rows: TrackerSignal[]) =>
      rows.find((row) => row.key === "personnel")!;
    await withTenantRlsContext(siteId, orgId, (tx) =>
      tx.compliancePersonnelRecord.create({
        data: {
          tenantId: siteId,
          orgId,
          subjectName: "Synthetic staff",
          roleDescription: "Teacher",
          kind: "SAFEGUARDING_TRAINING",
          scheme: null,
          title: "Synthetic safeguarding training",
          status: "RECORDED",
          createdByUserId: managerId,
          updatedByUserId: managerId,
        },
      }),
    );
    const after = await request(server)
      .get("/compliance/tracker/signals")
      .set("Authorization", manager)
      .expect(200);
    expect(signal(after.body).count).toBe(
      (signal(initial.body).count ?? 0) + 1,
    );
    expect(await app.get(TrackerService).history(actor, "test-duty")).toEqual(
      before,
    );
  });
  it("paginates retained requirement IDs across evidence-only records", async () => {
    if (!app) return;
    await withTenantRlsContext(otherSiteId, orgId, (tx) =>
      tx.complianceEvidence.createMany({
        data: Array.from({ length: 51 }, (_, index) => ({
          tenantId: otherSiteId,
          orgId,
          requirementId: `retained-${String(index).padStart(2, "0")}`,
          requirementVersion: 1,
          title: "Synthetic retained record",
          notes: "",
          fileName: "retained.pdf",
          storageKey: `tenants/${otherSiteId}/compliance-evidence/${randomUUID()}/document.pdf`,
          sha256: "0".repeat(64),
          createdByUserId: managerId,
        })),
      }),
    );
    const first = await request(app.getHttpServer())
      .get("/compliance/tracker/history/requirements")
      .set("Authorization", other)
      .expect(200);
    expect(first.body.items).toHaveLength(50);
    expect(first.body.nextCursor).toBe("retained-49");
    const second = await request(app.getHttpServer())
      .get(
        `/compliance/tracker/history/requirements?cursor=${first.body.nextCursor}`,
      )
      .set("Authorization", other)
      .expect(200);
    expect(second.body.items).toEqual([
      { requirementId: "retained-50", requirementVersion: 1, action: null },
    ]);
    expect(second.body.nextCursor).toBeNull();
  });
  it("requires a new site-profile revision after an organisation type changes", async () => {
    if (!app) return;
    const profileService = app.get(TrackerProfileService);
    const tracker = app.get(TrackerService);
    const before = await profileService.get(actor);
    expect(before).not.toBeNull();
    await prisma.orgVertical.update({
      where: { orgId },
      data: { vertical: "STATE_SCHOOL" },
    });
    try {
      const checklist = await tracker.checklist(actor);
      expect(checklist.organisationFacts?.vertical).toBe("STATE_SCHOOL");
      expect(checklist.profileNeedsSync).toBe(true);
      expect(checklist.progress.completed).toBe(0);
      await expect(tracker.attest(actor, await confirmation())).rejects.toThrow(
        "Save the site profile",
      );
      const saved = await profileService.save(actor, {
        expectedVersion: before!.version,
        profile: before!.profile,
      });
      expect(saved.version).toBe(before!.version + 1);
      expect(saved.profile.vertical).toBe("STATE_SCHOOL");
      expect((await tracker.checklist(actor)).profileNeedsSync).toBe(false);
    } finally {
      await prisma.orgVertical.update({
        where: { orgId },
        data: { vertical: "ACE_SCHOOL" },
      });
    }
  });
  it("selects an English district with its upper-tier and national coverage through the API", async () => {
    if (!app) return;
    const server = app.getHttpServer();
    const jurisdictions = await request(server)
      .get("/compliance/tracker/jurisdictions")
      .set("Authorization", reader)
      .expect(200);
    const oxford = jurisdictions.body.find(
      (entry: { subdivisionCode: string }) =>
        entry.subdivisionCode === "GB-ENG-E07000178",
    );
    expect(oxford).toMatchObject({ level: "LOCAL_AUTHORITY" });
    await save({ ...testProfile, jurisdictionId: oxford.id });
    catalogueProvider.catalogue = TRACKER_CATALOGUE;
    try {
      const result = await request(server)
        .get("/compliance/tracker/checklist")
        .set("Authorization", reader)
        .expect(200);
      expect(result.body.coverage).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            jurisdiction: "GB-ENG",
            status: "PARTIALLY_PUBLISHED",
            regionalStatus: "IN_REVIEW",
          }),
          expect.objectContaining({
            jurisdiction: "GB-ENG-E10000025",
            status: "IN_REVIEW",
          }),
          expect.objectContaining({
            jurisdiction: "GB-ENG-E07000178",
            status: "IN_REVIEW",
          }),
        ]),
      );
      expect(result.body.items.length).toBeGreaterThan(0);
      expect(result.body.coverageGaps).toBe(24);
    } finally {
      catalogueProvider.catalogue = trackerFixture();
    }
  });
  it("selects a Scottish council area with national actions and explicit local gaps", async () => {
    if (!app) return;
    const server = app.getHttpServer();
    const jurisdictions = await request(server)
      .get("/compliance/tracker/jurisdictions")
      .set("Authorization", reader)
      .expect(200);
    const edinburgh = jurisdictions.body.find(
      (entry: { subdivisionCode: string }) =>
        entry.subdivisionCode === "GB-SCT-S12000036",
    );
    expect(edinburgh).toMatchObject({ level: "LOCAL_AUTHORITY" });
    await save({ ...testProfile, jurisdictionId: edinburgh.id });
    catalogueProvider.catalogue = TRACKER_CATALOGUE;
    try {
      const result = await request(server)
        .get("/compliance/tracker/checklist")
        .set("Authorization", reader)
        .expect(200);
      expect(result.body.coverage).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            jurisdiction: "GB-SCT",
            status: "PARTIALLY_PUBLISHED",
            regionalStatus: "IN_REVIEW",
          }),
          expect.objectContaining({
            jurisdiction: "GB-SCT-S12000036",
            status: "IN_REVIEW",
          }),
        ]),
      );
      expect(result.body.items.length).toBeGreaterThan(0);
      expect(result.body.coverageGaps).toBe(16);
    } finally {
      catalogueProvider.catalogue = trackerFixture();
    }
  });
  it("selects a Northern Ireland district with national actions and explicit local gaps", async () => {
    if (!app) return;
    const server = app.getHttpServer();
    const jurisdictions = await request(server)
      .get("/compliance/tracker/jurisdictions")
      .set("Authorization", reader)
      .expect(200);
    const belfast = jurisdictions.body.find(
      (entry: { subdivisionCode: string }) =>
        entry.subdivisionCode === "GB-NIR-N09000003",
    );
    expect(belfast).toMatchObject({ level: "LOCAL_AUTHORITY" });
    await save({ ...testProfile, jurisdictionId: belfast.id });
    catalogueProvider.catalogue = TRACKER_CATALOGUE;
    try {
      const result = await request(server)
        .get("/compliance/tracker/checklist")
        .set("Authorization", reader)
        .expect(200);
      expect(result.body.coverage).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            jurisdiction: "GB-NIR",
            status: "PARTIALLY_PUBLISHED",
            regionalStatus: "IN_REVIEW",
          }),
          expect.objectContaining({
            jurisdiction: "GB-NIR-N09000003",
            status: "IN_REVIEW",
          }),
        ]),
      );
      expect(result.body.items.length).toBeGreaterThan(0);
      expect(result.body.coverageGaps).toBe(16);
    } finally {
      catalogueProvider.catalogue = trackerFixture();
    }
  });
});
