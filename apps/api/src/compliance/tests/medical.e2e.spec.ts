import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { prisma, withTenantRlsContext } from "@pathway/db";
import type { ComplianceMedicalUpdate } from "@pathway/types";
import { isEncryptedField } from "@pathway/util";
import request from "supertest";
import {
  requireDatabase,
  seedE2eAuthUser,
  seedE2eTypedRole,
} from "../../../test-helpers.e2e";
import { AppModule } from "../../app.module";
import * as audit from "../../audit/audit.service";
import { ChildrenService } from "../../children/children.service";
import { MedicalService } from "../medical.service";

describe("Medical information persistence and access boundaries", () => {
  const orgId = randomUUID();
  const siteId = randomUUID();
  const otherSiteId = randomUUID();
  const otherOrgId = randomUUID();
  const foreignSiteId = randomUUID();
  const managerId = randomUUID();
  const actor = { orgId, tenantId: siteId, userId: managerId };
  let app: INestApplication | undefined;
  let manager = "",
    reader = "",
    ordinary = "",
    otherManager = "",
    foreignManager = "";
  let childId = "",
    expiredId = "";
  const fields = {
    allergies: { status: "NONE", details: null },
    medicalConditions: {
      status: "RECORDED",
      details: "Private asthma care plan",
    },
    medicationAtSite: {
      status: "RECORDED",
      details: "Private inhaler instructions",
    },
  } satisfies Omit<ComplianceMedicalUpdate, "expectedUpdatedAt">;

  beforeAll(async () => {
    if (!requireDatabase()) return;
    for (const id of [orgId, otherOrgId]) {
      await prisma.org.create({
        data: {
          id,
          name: "Medical test",
          slug: `medical-${id}`,
          planCode: "trial",
        },
      });
      await prisma.orgVertical.create({
        data: { orgId: id, vertical: "ACE_LEARNING_CENTRE" },
      });
    }
    await prisma.tenant.createMany({
      data: [siteId, otherSiteId, foreignSiteId].map((id) => ({
        id,
        orgId: id === foreignSiteId ? otherOrgId : orgId,
        name: "Medical site",
        slug: `medical-${id}`,
        timezone: "Europe/London",
      })),
    });
    const tokens: string[] = [];
    for (const [userId, tenantId, permissionKeys] of [
      [
        managerId,
        siteId,
        ["compliance.medical.read", "compliance.medical.manage"],
      ],
      [randomUUID(), siteId, ["compliance.medical.read"]],
      [randomUUID(), siteId, []],
      [
        randomUUID(),
        otherSiteId,
        ["compliance.medical.read", "compliance.medical.manage"],
      ],
      [
        randomUUID(),
        foreignSiteId,
        ["compliance.medical.read", "compliance.medical.manage"],
      ],
    ] as const) {
      const scopeOrg = tenantId === foreignSiteId ? otherOrgId : orgId;
      const auth = await seedE2eAuthUser({
        subject: `medical-${userId}`,
        userId,
        tenantId,
        orgId: scopeOrg,
        siteRole: "STAFF",
        orgRole: "ORG_MEMBER",
        name: "Medical tester",
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
    [manager, reader, ordinary, otherManager, foreignManager] = tokens;
    const child = await prisma.child.create({
      data: {
        tenantId: siteId,
        firstName: "Medical",
        lastName: "Child",
        allergies: "none",
      },
    });
    childId = child.id;
    const expired = await prisma.child.create({
      data: {
        tenantId: siteId,
        firstName: "Expired",
        lastName: "Guest",
        isGuest: true,
        guestExpiresAt: new Date(0),
      },
    });
    expiredId = expired.id;
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterAll(async () => {
    if (app) await app.close();
  });

  it("includes unknown records, excludes expired guests, persists explicit none and encrypts clinical text", async () => {
    if (!app) return;
    const server = app.getHttpServer();
    const initial = await request(server)
      .get(`/compliance/medical/${childId}`)
      .set("Authorization", reader)
      .expect("Cache-Control", "private, no-store")
      .expect(200);
    expect(initial.body.allergies).toEqual({
      status: "UNKNOWN",
      details: null,
    });
    expect(initial.body.medicalConditions.status).toBe("UNKNOWN");
    await request(server)
      .get("/compliance/medical")
      .set("Authorization", reader)
      .expect(200)
      .expect(({ body }) => {
        expect(body.items.map((item: { id: string }) => item.id)).toEqual([
          childId,
        ]);
      });
    await request(server)
      .get(`/compliance/medical/${expiredId}`)
      .set("Authorization", reader)
      .expect(404);
    await request(server)
      .patch(`/compliance/medical/${childId}`)
      .set("Authorization", manager)
      .send({ ...fields, expectedUpdatedAt: initial.body.updatedAt })
      .expect(200);
    const saved = await request(server)
      .get(`/compliance/medical/${childId}`)
      .set("Authorization", reader)
      .expect(200);
    expect(saved.body).toMatchObject(fields);
    const stored = await withTenantRlsContext(
      siteId,
      orgId,
      (tx) =>
        tx.$queryRaw<
          Array<{
            allergies: string;
            medicalConditions: string;
            medicationAtSite: string;
          }>
        >`SELECT "allergies", "medicalConditions", "medicationAtSite" FROM app."Child" WHERE id = ${childId}`,
    );
    for (const value of Object.values(stored[0]))
      expect(isEncryptedField(value)).toBe(true);
    const events = await withTenantRlsContext(siteId, orgId, (tx) =>
      tx.auditEvent.findMany({
        where: { entityType: "CHILD_MEDICAL", tenantId: siteId },
      }),
    );
    expect(events.some((event) => event.action === "UPDATED")).toBe(true);
    expect(
      events.some(
        (event) =>
          event.entityId === null &&
          JSON.stringify(event.metadata).includes(childId),
      ),
    ).toBe(true);
    expect(JSON.stringify(events)).not.toContain(
      fields.medicalConditions.details,
    );
    const legacy = await app.get(ChildrenService).getById(childId, siteId);
    expect(legacy).not.toHaveProperty("medicalConditions");
    expect(legacy).not.toHaveProperty("medicationAtSite");
  });

  it("denies ordinary users, read-only writes/exports and cross-site/cross-organisation records", async () => {
    if (!app) return;
    const server = app.getHttpServer();
    const record = await app.get(MedicalService).get(childId, actor);
    await request(server)
      .get("/compliance/medical")
      .set("Authorization", ordinary)
      .expect(403);
    await request(server)
      .patch(`/compliance/medical/${childId}`)
      .set("Authorization", reader)
      .send({ ...fields, expectedUpdatedAt: record.updatedAt })
      .expect(403);
    await request(server)
      .get(`/compliance/medical/${childId}/export`)
      .set("Authorization", reader)
      .expect(403);
    for (const token of [otherManager, foreignManager]) {
      for (const suffix of ["", "/export"])
        await request(server)
          .get(`/compliance/medical/${childId}${suffix}`)
          .set("Authorization", token)
          .expect(404);
      await request(server)
        .get(`/compliance/medical?cursor=${childId}`)
        .set("Authorization", token)
        .expect(404);
      await request(server)
        .patch(`/compliance/medical/${childId}`)
        .set("Authorization", token)
        .send({ ...fields, expectedUpdatedAt: record.updatedAt })
        .expect(404);
    }
    await request(server)
      .patch(`/compliance/medical/${childId}`)
      .set("Authorization", manager)
      .send({
        ...fields,
        expectedUpdatedAt: record.updatedAt,
        tenantId: otherSiteId,
      })
      .expect(400);
    await request(server)
      .get(`/compliance/medical/${childId}/export`)
      .set("Authorization", manager)
      .expect("Cache-Control", "private, no-store")
      .expect(200)
      .expect(({ body }) => expect(body.record.id).toBe(childId));
    const events = await withTenantRlsContext(siteId, orgId, (tx) =>
      tx.auditEvent.findMany({
        where: {
          entityId: childId,
          action: "EXPORTED",
          entityType: "CHILD_MEDICAL",
        },
      }),
    );
    expect(events).toHaveLength(1);
  });

  it("allows one concurrent save and rolls back clinical changes if auditing fails", async () => {
    if (!app) return;
    const service = app.get(MedicalService);
    const initial = await service.get(childId, actor);
    const responses = await Promise.all(
      ["Plan one", "Plan two"].map((details) =>
        request(app!.getHttpServer())
          .patch(`/compliance/medical/${childId}`)
          .set("Authorization", manager)
          .send({
            ...fields,
            medicalConditions: { status: "RECORDED", details },
            expectedUpdatedAt: initial.updatedAt,
          }),
      ),
    );
    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 409,
    ]);
    const before = await service.get(childId, actor);
    const failure = jest
      .spyOn(audit, "recordAuditEventInTransaction")
      .mockRejectedValueOnce(new Error("Simulated audit failure"));
    try {
      await expect(
        service.update(
          childId,
          { ...fields, expectedUpdatedAt: before.updatedAt },
          actor,
        ),
      ).rejects.toThrow("Simulated audit failure");
    } finally {
      failure.mockRestore();
    }
    expect(await service.get(childId, actor)).toEqual(before);
  });

  it("preserves confirmations on unrelated legacy edits and clears them on allergy changes", async () => {
    if (!app) return;
    const medical = app.get(MedicalService);
    const children = app.get(ChildrenService);
    const initial = await medical.get(childId, actor);
    await medical.update(
      childId,
      { ...fields, expectedUpdatedAt: initial.updatedAt },
      actor,
    );
    await children.update(
      childId,
      { firstName: "Renamed", allergies: "none" },
      siteId,
      managerId,
      true,
    );
    expect((await medical.get(childId, actor)).allergies.status).toBe("NONE");
    await children.update(
      childId,
      { allergies: "Peanut allergy" },
      siteId,
      managerId,
      true,
    );
    expect((await medical.get(childId, actor)).allergies).toEqual({
      status: "RECORDED",
      details: "Peanut allergy",
    });
    await children.update(
      childId,
      { allergies: "none" },
      siteId,
      managerId,
      true,
    );
    expect((await medical.get(childId, actor)).allergies.status).toBe(
      "UNKNOWN",
    );
  });
  it("paginates without losing unknown records and rejects Home even with an assigned grant", async () => {
    if (!app) return;
    await prisma.child.createMany({
      data: Array.from({ length: 51 }, (_, index) => ({
        tenantId: otherSiteId,
        firstName: "Page",
        lastName: String(index),
      })),
    });
    const server = app.getHttpServer();
    const first = await request(server)
      .get("/compliance/medical")
      .set("Authorization", otherManager)
      .expect(200);
    expect(first.body.items).toHaveLength(50);
    expect(first.body.nextCursor).toEqual(expect.any(String));
    const second = await request(server)
      .get(`/compliance/medical?cursor=${first.body.nextCursor}`)
      .set("Authorization", otherManager)
      .expect(200);
    expect(second.body.items).toHaveLength(1);
    expect(second.body.nextCursor).toBeNull();
    expect(
      new Set(
        [...first.body.items, ...second.body.items].map(
          (item: { id: string }) => item.id,
        ),
      ).size,
    ).toBe(51);
    await prisma.orgVertical.updateMany({
      where: { orgId: otherOrgId },
      data: { vertical: "HOME_EDUCATION" },
    });
    await request(server)
      .get("/compliance/medical")
      .set("Authorization", foreignManager)
      .expect(403);
    await request(server).get("/compliance/medical").expect(401);
  });
});
