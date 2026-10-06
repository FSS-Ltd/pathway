import { randomUUID } from "node:crypto";
import { ExecutionContext, INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import { Prisma, prisma, withTenantRlsContext } from "@pathway/db";
import request from "supertest";
import { AppModule } from "../../app.module";
import { AuthUserGuard } from "../../auth/auth-user.guard";
import { OutboxService } from "../../common/outbox/outbox.service";
import { PaceRequestRlsRoleLease } from "./pace-request-rls-role-lease";
import {
  clearE2eAuthAccess,
  clearE2eTypedRole,
  requireDatabase,
  seedE2eAuthUser,
  seedE2eTypedRole,
} from "../../../test-helpers.e2e";

const TENANT_RLS_ROLE = "pathway_e2e_tenant_rls";
const E2E_BOOTSTRAP_ROLE = "pathway_test_user";

interface PaceRosterFixture {
  childAId: string;
  childBId: string;
  subjectAId: string;
  subjectBId: string;
  enrollmentAId: string;
  enrollmentBId: string;
  progressAId: string;
  progressBId: string;
  inventoryOrderAId: string;
  inventoryOrderBId: string;
  writerBId: string;
}

function useTenantRlsRole(): boolean {
  return process.env.E2E_USE_GLOBAL_SETUP === "true";
}

function bootstrapDatabaseUrl(): string {
  const databaseUrl = process.env.E2E_DATABASE_URL;
  if (!databaseUrl) throw new Error("E2E database URL is not configured");

  const url = new URL(databaseUrl);
  url.searchParams.set("options", `-c role=${E2E_BOOTSTRAP_ROLE}`);
  return url.toString();
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
  let requestUserId = "";
  let staffUserId = "";
  let staffAuthHeader = "";
  let typedRole: Awaited<ReturnType<typeof seedE2eTypedRole>> | undefined;
  let fixture: PaceRosterFixture | undefined;
  let createdOrgVertical = false;
  let requestRoleConfigured = false;
  let requestRoleLease: PaceRequestRlsRoleLease | undefined;

  beforeAll(async () => {
    if (!requireDatabase()) return;
    if (!orgId || !tenantAId || !tenantBId) {
      throw new Error("E2E tenant fixtures are not configured");
    }

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
    requestUserId = authUserId;
    const staff = await seedE2eAuthUser({
      subject: `pace-inventory-staff-${randomUUID()}`,
      tenantId: tenantAId,
      siteRole: "STAFF",
      orgId,
      orgRole: "ORG_MEMBER",
    });
    staffUserId = staff.userId;
    staffAuthHeader = staff.authorization;
    typedRole = await seedE2eTypedRole({
      orgId,
      tenantId: tenantAId,
      userId: authUserId,
      scope: "site",
      permissionKeys: [
        "ace.pace.read",
        "ace.pace.inventory.read",
        "ace.pace.inventory.manage",
      ],
    });

    fixture = await createFixture({
      orgId,
      tenantAId,
      tenantBId,
      writerAId: authUserId,
    });

    requestRoleLease = new PaceRequestRlsRoleLease({
      enabled: useTenantRlsRole(),
      bootstrapRole: E2E_BOOTSTRAP_ROLE,
      restrictedRole: TENANT_RLS_ROLE,
      requestClient: prisma,
      createBootstrapClient: () =>
        new PrismaClient({
          datasources: { db: { url: bootstrapDatabaseUrl() } },
        }),
    });
    await requestRoleLease.enable();
    requestRoleConfigured = requestRoleLease.isConfigured;

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(AuthUserGuard)
      .useValue({
        canActivate(context: ExecutionContext): boolean {
          const request = context
            .switchToHttp()
            .getRequest<Record<string, unknown>>();
          const isStaff = requestUserId === staffUserId;
          request.authUserId = requestUserId;
          request.__pathwayContext = {
            user: { userId: requestUserId },
            org: { orgId },
            tenant: { tenantId: tenantAId, orgId },
            roles: {
              org: [isStaff ? "org:member" : "org:admin"],
              tenant: [isStaff ? "tenant:staff" : "tenant:admin"],
            },
            permissions: [],
            rawClaims: {},
            siteRole: isStaff ? "STAFF" : "SITE_ADMIN",
          };
          return true;
        },
      })
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    let firstError: unknown;
    const cleanUp = async (operation: () => Promise<void>) => {
      try {
        await operation();
      } catch (error) {
        firstError ??= error;
      }
    };

    await cleanUp(() => app?.close() ?? Promise.resolve());
    await cleanUp(() => requestRoleLease?.restore() ?? Promise.resolve());
    await cleanUp(() =>
      fixture ? cleanupFixture(fixture) : Promise.resolve(),
    );
    await cleanUp(() =>
      typedRole ? clearE2eTypedRole(typedRole, orgId) : Promise.resolve(),
    );
    await cleanUp(async () => {
      if (!authUserId) return;
      await clearE2eAuthAccess(authUserId);
      await prisma.user.deleteMany({ where: { id: authUserId } });
    });
    await cleanUp(async () => {
      if (!staffUserId) return;
      await clearE2eAuthAccess(staffUserId);
      await prisma.user.deleteMany({ where: { id: staffUserId } });
    });
    await cleanUp(() =>
      createdOrgVertical
        ? prisma.orgVertical
            .deleteMany({ where: { orgId } })
            .then(() => undefined)
        : Promise.resolve(),
    );

    if (firstError) throw firstError;
  });

  it("opens request-path tenant transactions as the no-BYPASS RLS role", async () => {
    if (!requestRoleConfigured) return;

    const [role] = await withTenantRlsContext(
      tenantAId,
      orgId,
      (tx) =>
        tx.$queryRaw<
          Array<{
            currentUser: string;
            rolsuper: boolean;
            rolbypassrls: boolean;
          }>
        >`
        SELECT current_user AS "currentUser", rolsuper, rolbypassrls
        FROM pg_roles
        WHERE rolname = current_user
      `,
    );

    expect(role).toEqual({
      currentUser: TENANT_RLS_ROLE,
      rolsuper: false,
      rolbypassrls: false,
    });
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

  it("does not return another site's PACE exception to an active site A request", async () => {
    if (!app || !fixture) return;

    const response = await request(app.getHttpServer())
      .get("/ace/pace/exceptions")
      .set("Authorization", authHeader);

    expect(response.status).toBe(200);
    expect(response.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          child: { id: fixture.childAId },
          exceptions: ["BEHIND"],
        }),
      ]),
    );
    expect(response.body.items).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ child: { id: fixture.childBId } }),
      ]),
    );
  });

  it("reads only the active site's physical PACE orders and stock", async () => {
    if (!app || !fixture) return;

    const [orders, stock] = await Promise.all([
      request(app.getHttpServer())
        .get("/ace/pace/inventory/orders")
        .set("Authorization", authHeader),
      request(app.getHttpServer())
        .get("/ace/pace/inventory/stock?attentionOnly=true")
        .set("Authorization", authHeader),
    ]);

    expect(orders.status).toBe(200);
    expect(orders.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: fixture.inventoryOrderAId }),
      ]),
    );
    expect(orders.body.items).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: fixture.inventoryOrderBId }),
      ]),
    );
    expect(stock.status).toBe(200);
    expect(stock.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          child: { id: fixture.childAId, displayName: "PACE Site A" },
          stockState: "NO_STOCK",
          needsAttention: true,
        }),
      ]),
    );
    expect(stock.body.items).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          child: expect.objectContaining({ id: fixture.childBId }),
        }),
      ]),
    );
  });

  it("ignores pending orders for supplied PACEs, then suppresses attention for an uncovered order", async () => {
    if (!app || !fixture) return;
    const { childAId, subjectAId } = fixture;
    const supplyId = randomUUID();
    const uncoveredOrderId = randomUUID();
    await withPaceRlsContext(tenantAId, orgId, (tx) =>
      tx.paceInventorySupply.create({
        data: {
          id: supplyId,
          tenantId: tenantAId,
          childId: childAId,
          subjectId: subjectAId,
          paceNumber: 1002,
          source: "CURRENT_STOCK",
          createdByUserId: authUserId,
        },
      }),
    );
    try {
      const [stock, attentionBeforeOrder] = await Promise.all([
        request(app.getHttpServer())
          .get("/ace/pace/inventory/stock")
          .set("Authorization", authHeader),
        request(app.getHttpServer())
          .get("/ace/pace/inventory/stock?attentionOnly=true")
          .set("Authorization", authHeader),
      ]);
      expect(stock.status).toBe(200);
      expect(stock.body.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            child: { id: fixture.childAId, displayName: "PACE Site A" },
            currentPace: 1001,
            futurePaceNumbers: [1002],
            availableCount: 1,
            hasPendingOrder: false,
            stockState: "LOW_STOCK",
            needsAttention: true,
          }),
        ]),
      );
      expect(attentionBeforeOrder.status).toBe(200);
      expect(attentionBeforeOrder.body.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            child: expect.objectContaining({ id: fixture.childAId }),
          }),
        ]),
      );
      await withPaceRlsContext(tenantAId, orgId, (tx) =>
        tx.paceInventoryOrder.create({
          data: {
            id: uncoveredOrderId,
            tenantId: tenantAId,
            childId: childAId,
            subjectId: subjectAId,
            paceNumber: 1004,
            createdByUserId: authUserId,
          },
        }),
      );
      const attentionAfterOrder = await request(app.getHttpServer())
        .get("/ace/pace/inventory/stock?attentionOnly=true")
        .set("Authorization", authHeader);
      expect(attentionAfterOrder.status).toBe(200);
      expect(attentionAfterOrder.body.items).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            child: expect.objectContaining({ id: fixture.childAId }),
          }),
        ]),
      );
    } finally {
      await withPaceRlsContext(tenantAId, orgId, async (tx) => {
        await tx.paceInventoryOrder.deleteMany({
          where: { id: uncoveredOrderId },
        });
        await tx.paceInventorySupply.deleteMany({ where: { id: supplyId } });
      });
    }
  });

  it("denies inventory reads to a staff member without inventory permission", async () => {
    if (!app || !staffUserId) return;
    requestUserId = staffUserId;
    try {
      for (const route of ["orders", "stock"]) {
        const response = await request(app.getHttpServer())
          .get(`/ace/pace/inventory/${route}`)
          .set("Authorization", staffAuthHeader);
        expect(response.status).toBe(403);
      }
    } finally {
      requestUserId = authUserId;
    }
  });

  it("creates a bounded order batch with audit and outbox facts", async () => {
    if (!app || !fixture) return;
    const { childAId, subjectAId } = fixture;
    const response = await request(app.getHttpServer())
      .post("/ace/pace/inventory/orders")
      .set("Authorization", authHeader)
      .send({
        childId: childAId,
        subjectId: subjectAId,
        paceNumbers: [1003, 1004],
      });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      batchId: expect.any(String),
      orderIds: [expect.any(String), expect.any(String)],
      created: 2,
    });
    const { batchId, orderIds } = response.body as {
      batchId: string;
      orderIds: string[];
    };
    try {
      await withPaceRlsContext(tenantAId, orgId, async (tx) => {
        const [orders, audit, outbox] = await Promise.all([
          tx.paceInventoryOrder.findMany({
            where: { id: { in: orderIds } },
            orderBy: { paceNumber: "asc" },
          }),
          tx.auditEvent.findFirst({ where: { entityId: batchId } }),
          tx.outboxEvent.findFirst({ where: { aggregateId: batchId } }),
        ]);
        expect(orders.map((order) => order.paceNumber)).toEqual([1003, 1004]);
        expect(orders.every((order) => order.tenantId === tenantAId)).toBe(
          true,
        );
        expect(audit?.actorUserId).toBe(authUserId);
        expect(outbox?.eventType).toBe("ace.pace.inventory.orders.created");
      });

      const duplicate = await request(app.getHttpServer())
        .post("/ace/pace/inventory/orders")
        .set("Authorization", authHeader)
        .send({
          childId: childAId,
          subjectId: subjectAId,
          paceNumbers: [1004, 1005],
        });
      expect(duplicate.status).toBe(409);
      const uncreated = await withPaceRlsContext(tenantAId, orgId, (tx) =>
        tx.paceInventoryOrder.count({
          where: {
            tenantId: tenantAId,
            childId: childAId,
            subjectId: subjectAId,
            paceNumber: 1005,
          },
        }),
      );
      expect(uncreated).toBe(0);
    } finally {
      await withPaceRlsContext(tenantAId, orgId, async (tx) => {
        await tx.outboxEvent.deleteMany({ where: { aggregateId: batchId } });
        await tx.auditEvent.deleteMany({ where: { entityId: batchId } });
        await tx.paceInventoryOrder.deleteMany({
          where: { id: { in: orderIds } },
        });
      });
    }
  });

  it("denies cross-site, staff, and invalid order requests", async () => {
    if (!app || !fixture) return;
    const valid = {
      childId: fixture.childAId,
      subjectId: fixture.subjectAId,
      paceNumbers: [1003],
    };
    const crossSite = await request(app.getHttpServer())
      .post("/ace/pace/inventory/orders")
      .set("Authorization", authHeader)
      .send({
        ...valid,
        childId: fixture.childBId,
        subjectId: fixture.subjectBId,
      });
    expect(crossSite.status).toBe(404);

    requestUserId = staffUserId;
    try {
      const denied = await request(app.getHttpServer())
        .post("/ace/pace/inventory/orders")
        .set("Authorization", staffAuthHeader)
        .send(valid);
      expect(denied.status).toBe(403);
    } finally {
      requestUserId = authUserId;
    }

    for (const paceNumbers of [[1003, 1003], [1000], Array(25).fill(1003)]) {
      const invalid = await request(app.getHttpServer())
        .post("/ace/pace/inventory/orders")
        .set("Authorization", authHeader)
        .send({ ...valid, paceNumbers });
      expect(invalid.status).toBe(400);
    }
  });

  it("rejects orders for physical PACEs already supplied", async () => {
    if (!app || !fixture) return;
    const { childAId, subjectAId } = fixture;
    const supplyId = randomUUID();
    await withPaceRlsContext(tenantAId, orgId, (tx) =>
      tx.paceInventorySupply.create({
        data: {
          id: supplyId,
          tenantId: tenantAId,
          childId: childAId,
          subjectId: subjectAId,
          paceNumber: 1006,
          source: "CURRENT_STOCK",
          createdByUserId: authUserId,
        },
      }),
    );
    try {
      const response = await request(app.getHttpServer())
        .post("/ace/pace/inventory/orders")
        .set("Authorization", authHeader)
        .send({
          childId: childAId,
          subjectId: subjectAId,
          paceNumbers: [1006],
        });
      expect(response.status).toBe(409);
    } finally {
      await withPaceRlsContext(tenantAId, orgId, (tx) =>
        tx.paceInventorySupply.delete({ where: { id: supplyId } }),
      );
    }
  });

  it("rolls back orders and audit when the outbox write fails", async () => {
    if (!app || !fixture) return;
    const { childAId, subjectAId } = fixture;
    const enqueue = jest
      .spyOn(OutboxService.prototype, "enqueue")
      .mockRejectedValueOnce(new Error("Forced outbox failure"));
    try {
      const response = await request(app.getHttpServer())
        .post("/ace/pace/inventory/orders")
        .set("Authorization", authHeader)
        .send({
          childId: childAId,
          subjectId: subjectAId,
          paceNumbers: [1005],
        });
      expect(response.status).toBe(500);
      const [orders, audit] = await withPaceRlsContext(
        tenantAId,
        orgId,
        async (tx) =>
          Promise.all([
            tx.paceInventoryOrder.count({
              where: {
                tenantId: tenantAId,
                childId: childAId,
                subjectId: subjectAId,
                paceNumber: 1005,
              },
            }),
            tx.auditEvent.count({
              where: {
                tenantId: tenantAId,
                entityType: "ACE_RECORD",
                metadata: {
                  path: ["event"],
                  equals: "pace_inventory_orders_created",
                },
              },
            }),
          ]),
      );
      expect(orders).toBe(0);
      expect(audit).toBe(0);
    } finally {
      enqueue.mockRestore();
    }
  });

  it("rejects unbounded and unknown inventory query parameters", async () => {
    if (!app) return;
    const [tooLarge, unknown] = await Promise.all([
      request(app.getHttpServer())
        .get("/ace/pace/inventory/orders?limit=51")
        .set("Authorization", authHeader),
      request(app.getHttpServer())
        .get("/ace/pace/inventory/stock?unexpected=true")
        .set("Authorization", authHeader),
    ]);
    expect(tooLarge.status).toBe(400);
    expect(unknown.status).toBe(400);
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
    inventoryOrderAId: randomUUID(),
    inventoryOrderBId: randomUUID(),
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
        trackStatus: "BEHIND",
        rebuiltAt: new Date("2026-09-02T00:00:00.000Z"),
      },
    });
    await tx.paceInventoryOrder.create({
      data: {
        id: fixture.inventoryOrderAId,
        tenantId: input.tenantAId,
        childId: fixture.childAId,
        subjectId: fixture.subjectAId,
        paceNumber: 1002,
        createdByUserId: input.writerAId,
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
        trackStatus: "BEHIND",
        rebuiltAt: new Date("2026-09-02T00:00:00.000Z"),
      },
    });
    await tx.paceInventoryOrder.create({
      data: {
        id: fixture.inventoryOrderBId,
        tenantId: input.tenantBId,
        childId: fixture.childBId,
        subjectId: fixture.subjectBId,
        paceNumber: 1002,
        createdByUserId: fixture.writerBId,
      },
    });
  });
  return fixture;
}

async function cleanupFixture(fixture: PaceRosterFixture): Promise<void> {
  await prisma.paceInventoryOrder.deleteMany({
    where: {
      id: { in: [fixture.inventoryOrderAId, fixture.inventoryOrderBId] },
    },
  });
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
  await prisma.siteMembership.deleteMany({
    where: { userId: fixture.writerBId },
  });
  await prisma.user.deleteMany({ where: { id: fixture.writerBId } });
}
