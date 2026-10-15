import { createCipheriv, randomBytes, randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { prisma } from "@pathway/db";
import type { ComplianceMedicalRecord } from "@pathway/types";
import request from "supertest";
import {
  requireDatabase,
  seedE2eAuthUser,
  seedE2eTypedRole,
} from "../../../test-helpers.e2e";
import { AppModule } from "../../app.module";
import { ChildrenService } from "../../children/children.service";

const clinicalFields = [
  "allergies",
  "medicalConditions",
  "medicationAtSite",
] as const;
/** A real authenticated envelope under an unrelated synthetic key, without changing app keys. */
function wrongKeyEnvelope(): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", randomBytes(32), iv);
  const encrypted = Buffer.concat([
    cipher.update("Synthetic private clinical information", "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}
const emptyUpdate = {
  allergies: { status: "NONE", details: null },
  medicalConditions: { status: "NONE", details: null },
  medicationAtSite: { status: "NONE", details: null },
};

describe("Medical unavailable-value preservation", () => {
  const orgId = randomUUID(),
    siteId = randomUUID(),
    otherSiteId = randomUUID(),
    foreignOrgId = randomUUID(),
    foreignSiteId = randomUUID();
  let app: INestApplication | undefined;
  let manager = "",
    reader = "",
    ordinary = "",
    otherManager = "",
    foreignManager = "";
  beforeAll(async () => {
    if (!requireDatabase()) return;
    for (const id of [orgId, foreignOrgId]) {
      await prisma.org.create({
        data: {
          id,
          name: "Medical recovery fixture",
          slug: `medical-recovery-${id}`,
          planCode: "trial",
        },
      });
      await prisma.orgVertical.create({
        data: { orgId: id, vertical: "ACE_SCHOOL" },
      });
    }
    await prisma.tenant.createMany({
      data: [siteId, otherSiteId, foreignSiteId].map((id) => ({
        id,
        orgId: id === foreignSiteId ? foreignOrgId : orgId,
        name: "Recovery site",
        slug: `recovery-${id}`,
        timezone: "Europe/London",
      })),
    });
    const tokens: string[] = [];
    for (const [tenantId, permissions] of [
      [siteId, ["compliance.medical.read", "compliance.medical.manage"]],
      [siteId, ["compliance.medical.read"]],
      [siteId, []],
      [otherSiteId, ["compliance.medical.read", "compliance.medical.manage"]],
      [foreignSiteId, ["compliance.medical.read", "compliance.medical.manage"]],
    ] as const) {
      const userId = randomUUID(),
        scopeOrg = tenantId === foreignSiteId ? foreignOrgId : orgId;
      const auth = await seedE2eAuthUser({
        subject: `medical-recovery-${userId}`,
        userId,
        tenantId,
        orgId: scopeOrg,
        siteRole: "STAFF",
        orgRole: "ORG_MEMBER",
        name: "Recovery tester",
      });
      if (permissions.length)
        await seedE2eTypedRole({
          orgId: scopeOrg,
          tenantId,
          userId,
          scope: "site",
          permissionKeys: permissions,
        });
      tokens.push(auth.authorization);
    }
    [manager, reader, ordinary, otherManager, foreignManager] = tokens;
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterAll(async () => {
    if (app) await app.close();
  });

  it.each(
    clinicalFields.flatMap((field) =>
      ["wrong-key", "malformed"].map((kind) => ({ field, kind })),
    ),
  )("does not expose or overwrite $kind $field", async ({ field, kind }) => {
    if (!app) return;
    const ciphertext =
      kind === "wrong-key"
        ? wrongKeyEnvelope()
        : "v1:unreadable-medical-fixture";
    const child = await prisma.child.create({
      data: {
        tenantId: siteId,
        firstName: "Synthetic",
        lastName: "Medical",
        allergies: "none",
        allergiesConfirmedAt: new Date(),
        medicalConditions: "none",
        medicationAtSite: "none",
        [field]: ciphertext,
      },
    });
    const before = await prisma.$queryRaw<
      {
        allergies: string;
        medicalConditions: string | null;
        medicationAtSite: string | null;
        allergiesConfirmedAt: Date | null;
        updatedAt: Date;
      }[]
    >`SELECT allergies,"medicalConditions","medicationAtSite","allergiesConfirmedAt","updatedAt" FROM "Child" WHERE id=${child.id}`;
    const server = app.getHttpServer();
    const detail = await request(server)
      .get(`/compliance/medical/${child.id}`)
      .set("Authorization", reader)
      .expect("Cache-Control", "private, no-store")
      .expect(200);
    expect(detail.body[field]).toEqual({
      status: "UNAVAILABLE",
      details: null,
    });
    const list = await request(server)
      .get("/compliance/medical")
      .set("Authorization", reader)
      .expect(200);
    const listed = list.body.items.find(
      (row: ComplianceMedicalRecord) => row.id === child.id,
    );
    expect(listed[field]).toEqual({ status: "UNAVAILABLE", details: null });
    const exported = await request(server)
      .get(`/compliance/medical/${child.id}/export`)
      .set("Authorization", manager)
      .expect(200);
    expect(exported.body.record[field]).toEqual({
      status: "UNAVAILABLE",
      details: null,
    });
    for (const payload of [detail.body, list.body, exported.body]) {
      expect(JSON.stringify(payload)).not.toContain(ciphertext);
      expect(JSON.stringify(payload)).not.toContain(
        "Synthetic private clinical information",
      );
    }
    const blocked = await request(server)
      .patch(`/compliance/medical/${child.id}`)
      .set("Authorization", manager)
      .send({
        ...emptyUpdate,
        expectedUpdatedAt: child.updatedAt.toISOString(),
      })
      .expect(503);
    expect(blocked.body.code).toBe("MEDICAL_INFORMATION_UNAVAILABLE");
    const after = await prisma.$queryRaw<
      typeof before
    >`SELECT allergies,"medicalConditions","medicationAtSite","allergiesConfirmedAt","updatedAt" FROM "Child" WHERE id=${child.id}`;
    expect(after).toEqual(before);
    expect(after[0][field]).toBe(ciphertext);
  });

  it("rejects ciphertext writes and preserves existing read/manage and tenant boundaries", async () => {
    if (!app) return;
    const server = app.getHttpServer();
    const child = await prisma.child.create({
      data: {
        tenantId: siteId,
        firstName: "Boundary",
        lastName: "Medical",
        allergies: "v1:unreadable-boundary",
      },
    });
    for (const token of [otherManager, foreignManager]) {
      await request(server)
        .get(`/compliance/medical/${child.id}`)
        .set("Authorization", token)
        .expect(404);
      await request(server)
        .get(`/compliance/medical/${child.id}/export`)
        .set("Authorization", token)
        .expect(404);
      await request(server)
        .patch(`/compliance/medical/${child.id}`)
        .set("Authorization", token)
        .send({
          ...emptyUpdate,
          expectedUpdatedAt: child.updatedAt.toISOString(),
        })
        .expect(404);
    }
    await request(server)
      .get(`/compliance/medical/${child.id}`)
      .set("Authorization", ordinary)
      .expect(403);
    await request(server)
      .get(`/compliance/medical/${child.id}/export`)
      .set("Authorization", reader)
      .expect(403);
    await request(server)
      .patch(`/compliance/medical/${child.id}`)
      .set("Authorization", reader)
      .send({
        ...emptyUpdate,
        expectedUpdatedAt: child.updatedAt.toISOString(),
      })
      .expect(403);
    const readable = await prisma.child.create({
      data: {
        tenantId: siteId,
        firstName: "Readable",
        lastName: "Medical",
        allergies: "Pollen",
      },
    });
    for (const details of [wrongKeyEnvelope(), "v1:malformed"]) {
      await request(server)
        .patch(`/compliance/medical/${readable.id}`)
        .set("Authorization", manager)
        .send({
          ...emptyUpdate,
          allergies: { status: "RECORDED", details },
          expectedUpdatedAt: readable.updatedAt.toISOString(),
        })
        .expect(400);
    }
    const detail = await request(server)
      .get(`/compliance/medical/${readable.id}`)
      .set("Authorization", reader)
      .expect(200);
    expect(detail.body.allergies).toEqual({
      status: "RECORDED",
      details: "Pollen",
    });
  });
  it("blocks legacy replacement while allowing unrelated updates and identical resubmission", async () => {
    if (!app) return;
    const ciphertext = wrongKeyEnvelope();
    const child = await prisma.child.create({
      data: {
        tenantId: siteId,
        firstName: "Legacy",
        lastName: "Medical",
        allergies: ciphertext,
        allergiesConfirmedAt: new Date(),
      },
    });
    const service = app.get(ChildrenService);
    await expect(
      service.update(child.id, { allergies: "none" }, siteId),
    ).rejects.toMatchObject({
      response: { code: "MEDICAL_INFORMATION_UNAVAILABLE" },
    });
    await service.update(child.id, { firstName: "Renamed" }, siteId);
    await service.update(
      child.id,
      { lastName: "Retained", allergies: ciphertext },
      siteId,
    );
    const rows = await prisma.$queryRaw<
      {
        allergies: string;
        allergiesConfirmedAt: Date | null;
        firstName: string;
        lastName: string;
      }[]
    >`SELECT allergies,"allergiesConfirmedAt","firstName","lastName" FROM "Child" WHERE id=${child.id}`;
    expect(rows[0]).toEqual({
      allergies: ciphertext,
      allergiesConfirmedAt: child.allergiesConfirmedAt,
      firstName: "Renamed",
      lastName: "Retained",
    });
    const readable = await prisma.child.create({
      data: {
        tenantId: siteId,
        firstName: "Readable",
        lastName: "Legacy",
        allergies: "Pollen",
      },
    });
    await expect(
      service.update(readable.id, { allergies: ciphertext }, siteId),
    ).rejects.toThrow("Encrypted medical values cannot be submitted");
  });
});
