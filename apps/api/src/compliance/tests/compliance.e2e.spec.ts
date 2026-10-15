import { randomUUID } from "node:crypto";
import type { ComplianceRecordInput } from "@pathway/types";
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
import { ComplianceService } from "../compliance.service";
import * as audit from "../../audit/audit.service";

// Immutable audit/history fixtures deliberately remain in the disposable e2e DB
// until the next test bootstrap. Cleanup must not bypass their retention controls.
describe("Compliance register API persistence and authorization", () => {
  const orgId = randomUUID();
  const siteId = randomUUID();
  const otherSiteId = randomUUID();
  const managerId = randomUUID();
  const readerId = randomUUID();
  const ordinaryId = randomUUID();
  const otherManagerId = randomUUID();
  let app: INestApplication | undefined;
  let manager = "";
  let reader = "";
  let ordinary = "";
  let otherManager = "";
  const actor = { orgId, tenantId: siteId, userId: managerId };
  const input: ComplianceRecordInput = {
    subjectName: "Register Test Person",
    subjectUserId: null,
    roleDescription: "Session volunteer",
    kind: "BACKGROUND_CHECK",
    scheme: "DBS",
    title: "Role-appropriate check",
    provider: null,
    reference: "sensitive-reference",
    completedOn: "2026-01-01",
    reviewDueOn: "2026-02-01",
    status: "VERIFIED",
    notes: "Private evidence note",
    verificationNotes: "Original certificate inspected",
  };

  beforeAll(async () => {
    if (!requireDatabase()) return;
    await prisma.org.create({
      data: {
        id: orgId,
        name: "Compliance API test",
        slug: `compliance-${orgId}`,
        planCode: "trial",
      },
    });
    await prisma.tenant.createMany({
      data: [siteId, otherSiteId].map((id) => ({
        id,
        orgId,
        name: "Compliance site",
        slug: `compliance-${id}`,
        timezone: "Europe/London",
      })),
    });
    await prisma.orgVertical.create({
      data: { orgId, vertical: "ACE_LEARNING_CENTRE" },
    });
    for (const [userId, tenantId, permissions] of [
      [
        managerId,
        siteId,
        ["compliance.checks.read", "compliance.checks.manage"],
      ],
      [readerId, siteId, ["compliance.checks.read"]],
      [ordinaryId, siteId, []],
      [
        otherManagerId,
        otherSiteId,
        ["compliance.checks.read", "compliance.checks.manage"],
      ],
    ] as const) {
      const auth = await seedE2eAuthUser({
        subject: `compliance-${userId}`,
        userId,
        tenantId,
        orgId,
        siteRole: "STAFF",
        orgRole: "ORG_MEMBER",
        name: "Compliance person",
      });
      if (permissions.length)
        await seedE2eTypedRole({
          orgId,
          tenantId,
          userId,
          scope: "site",
          permissionKeys: permissions,
        });
      if (userId === managerId) manager = auth.authorization;
      if (userId === readerId) reader = auth.authorization;
      if (userId === ordinaryId) ordinary = auth.authorization;
      if (userId === otherManagerId) otherManager = auth.authorization;
    }
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterAll(async () => {
    if (app) await app.close();
  });

  it("persists edits across requests, retains versions and archives without deleting history", async () => {
    if (!app) return;
    const server = app.getHttpServer();
    const created = await request(server)
      .post("/compliance/checks")
      .set("Authorization", manager)
      .send(input)
      .expect(201);
    const id = String(created.body.id);
    expect(created.body).toMatchObject({
      version: 1,
      verifiedByUserId: managerId,
      completedOn: "2026-01-01",
    });
    await request(server)
      .get("/compliance/checks")
      .set("Authorization", reader)
      .expect("Cache-Control", "private, no-store")
      .expect(200)
      .expect(({ body }) =>
        expect(body.items.some((item: { id: string }) => item.id === id)).toBe(
          true,
        ),
      );
    const listEvents = await withTenantRlsContext(siteId, orgId, (tx) =>
      tx.auditEvent.findMany({
        where: {
          tenantId: siteId,
          actorUserId: readerId,
          entityType: "COMPLIANCE_PERSONNEL",
          action: "VIEWED",
          entityId: null,
        },
      }),
    );
    expect(
      listEvents.some((event) =>
        JSON.stringify(event.metadata).includes(id),
      ),
    ).toBe(true);
    expect(JSON.stringify(listEvents)).not.toContain(input.notes);
    await request(server)
      .get(`/compliance/checks/${id}`)
      .set("Authorization", reader)
      .expect(200)
      .expect(({ body }) => expect(body.notes).toBe(input.notes));
    await request(server)
      .patch(`/compliance/checks/${id}`)
      .set("Authorization", manager)
      .send({ ...input, title: "Updated role check", expectedVersion: 1 })
      .expect(200)
      .expect(({ body }) => expect(body.version).toBe(2));
    await request(server)
      .patch(`/compliance/checks/${id}`)
      .set("Authorization", manager)
      .send({ ...input, expectedVersion: 1 })
      .expect(409);
    await request(server)
      .get(`/compliance/checks/${id}/history`)
      .set("Authorization", reader)
      .expect(200)
      .expect(({ body }) => {
        expect(
          body.items.map((item: { version: number }) => item.version),
        ).toEqual([2, 1]);
        expect(body.items[1].snapshot.title).toBe(input.title);
      });
    await request(server)
      .post(`/compliance/checks/${id}/archive`)
      .set("Authorization", manager)
      .send({ expectedVersion: 2 })
      .expect(201);
    await request(server)
      .patch(`/compliance/checks/${id}`)
      .set("Authorization", manager)
      .send({ ...input, expectedVersion: 3 })
      .expect(409);
    await request(server)
      .get(`/compliance/checks/${id}/history`)
      .set("Authorization", reader)
      .expect(200)
      .expect(({ body }) => expect(body.items).toHaveLength(3));
    await request(server)
      .get(`/compliance/checks/${id}/export`)
      .set("Authorization", reader)
      .expect(403);
    await request(server)
      .get(`/compliance/checks/${id}/export`)
      .set("Authorization", manager)
      .expect(200)
      .expect(({ body }) => {
        expect(body.record.id).toBe(id);
        expect(body.history.items).toHaveLength(3);
        expect(body.history.nextCursor).toBeNull();
        expect(body.exportedAt).toEqual(expect.any(String));
      });
    const events = await withTenantRlsContext(siteId, orgId, (tx) =>
      tx.auditEvent.findMany({
        where: { entityId: id, entityType: "COMPLIANCE_PERSONNEL" },
      }),
    );
    expect(events.filter((event) => event.action === "CREATED")).toHaveLength(
      1,
    );
    expect(events.filter((event) => event.action === "UPDATED")).toHaveLength(
      2,
    );
    expect(events.some((event) => event.action === "VIEWED")).toBe(true);
    expect(events.some((event) => event.action === "EXPORTED")).toBe(true);
    expect(JSON.stringify(events)).not.toContain(input.notes);
  });

  it("denies ordinary users, read-only writes, foreign records, foreign links and spoofed scope", async () => {
    if (!app) return;
    const server = app.getHttpServer();
    await request(server)
      .get("/compliance/checks")
      .set("Authorization", ordinary)
      .expect(403);
    await request(server)
      .post("/compliance/checks")
      .set("Authorization", reader)
      .send(input)
      .expect(403);
    await request(server)
      .post("/compliance/checks")
      .set("Authorization", manager)
      .send({ ...input, tenantId: otherSiteId })
      .expect(400);
    await request(server)
      .post("/compliance/checks")
      .set("Authorization", manager)
      .send({ ...input, subjectUserId: otherManagerId })
      .expect(404);
    const created = await request(server)
      .post("/compliance/checks")
      .set("Authorization", manager)
      .send(input)
      .expect(201);
    const id = String(created.body.id);
    for (const suffix of ["", "/history", "/export"])
      await request(server)
        .get(`/compliance/checks/${id}${suffix}`)
        .set("Authorization", otherManager)
        .expect(404);
    await request(server)
      .patch(`/compliance/checks/${id}`)
      .set("Authorization", otherManager)
      .send({ ...input, expectedVersion: 1 })
      .expect(404);
    await request(server)
      .get(`/compliance/checks?cursor=${id}`)
      .set("Authorization", otherManager)
      .expect(404);
    await request(server)
      .get("/compliance/people")
      .set("Authorization", reader)
      .expect(403);
    await request(server)
      .get("/compliance/people")
      .set("Authorization", manager)
      .expect(200)
      .expect(({ body }) => {
        expect(
          body.items.some(
            (person: { id: string }) => person.id === otherManagerId,
          ),
        ).toBe(false);
        expect(
          body.items.every(
            (person: object) => Object.keys(person).sort().join() === "id,name",
          ),
        ).toBe(true);
      });
  });

  it("allows exactly one concurrent update and rolls back record and revision if audit fails", async () => {
    if (!app) return;
    const server = app.getHttpServer();
    const created = await request(server)
      .post("/compliance/checks")
      .set("Authorization", manager)
      .send(input)
      .expect(201);
    const id = String(created.body.id);
    const responses = await Promise.all(
      ["First edit", "Second edit"].map((title) =>
        request(server)
          .patch(`/compliance/checks/${id}`)
          .set("Authorization", manager)
          .send({ ...input, title, expectedVersion: 1 }),
      ),
    );
    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 409,
    ]);
    const service = app.get(ComplianceService);
    const before = await service.get(id, actor);
    const failure = jest
      .spyOn(audit, "recordAuditEventInTransaction")
      .mockRejectedValueOnce(new Error("Simulated audit storage failure"));
    try {
      await expect(
        service.update(id, { ...input, title: "Must roll back" }, 2, actor),
      ).rejects.toThrow("Simulated audit storage failure");
    } finally {
      failure.mockRestore();
    }
    expect(await service.get(id, actor)).toEqual(before);
    expect((await service.history(id, undefined, actor)).items).toHaveLength(2);
  });
});
