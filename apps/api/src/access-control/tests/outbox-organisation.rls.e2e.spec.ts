import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { prisma, runTransaction } from "@pathway/db";
import {
  createRolesTransactionBoundary,
  type RoleActorContext,
} from "../roles.service";
import { OutboxService } from "../../common/outbox/outbox.service";
import {
  isDatabaseAvailable,
  requireDatabase,
} from "../../../test-helpers.e2e";

const ORG_ID = process.env.E2E_ORG_ID as string;
const RLS_ROLE = "pathway_e2e_rls";

function transactionBoundary() {
  return createRolesTransactionBoundary(async (operation) =>
    runTransaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL ROLE "${RLS_ROLE}"`);
      return operation(tx);
    }),
  );
}

describe("outbox organisation idempotency integration", () => {
  const secondOrgId = randomUUID();
  const dueOrgId = randomUUID();
  const stalledOrgId = randomUUID();
  const futureOnlyOrgId = randomUUID();
  const firstOrgActor: RoleActorContext = {
    orgId: ORG_ID,
    tenantId: undefined,
    userId: randomUUID(),
    legacyOrgRoles: [],
    requestId: `first-org-${randomUUID()}`,
  };
  const secondOrgActor: RoleActorContext = {
    ...firstOrgActor,
    orgId: secondOrgId,
    requestId: `second-org-${randomUUID()}`,
  };
  const outbox = new OutboxService();
  let admin: PrismaClient | undefined;

  beforeAll(async () => {
    if (!requireDatabase()) return;
    const adminDatabaseUrl =
      process.env.E2E_BOOTSTRAP_DATABASE_URL ?? process.env.E2E_DATABASE_URL;
    if (!adminDatabaseUrl) {
      throw new Error(
        "E2E_BOOTSTRAP_DATABASE_URL or E2E_DATABASE_URL is required for outbox discovery",
      );
    }
    admin = new PrismaClient({
      datasources: { db: { url: adminDatabaseUrl } },
    });
    await prisma.org.createMany({
      data: [
        {
          id: secondOrgId,
          name: `Assignment outbox org ${secondOrgId}`,
          slug: `assignment-outbox-${secondOrgId}`,
          planCode: "trial",
        },
        {
          id: dueOrgId,
          name: `Due outbox org ${dueOrgId}`,
          slug: `due-outbox-${dueOrgId}`,
          planCode: "trial",
        },
        {
          id: stalledOrgId,
          name: `Stalled outbox org ${stalledOrgId}`,
          slug: `stalled-outbox-${stalledOrgId}`,
          planCode: "trial",
        },
        {
          id: futureOnlyOrgId,
          name: `Future outbox org ${futureOnlyOrgId}`,
          slug: `future-outbox-${futureOnlyOrgId}`,
          planCode: "trial",
        },
      ],
    });
  });

  afterAll(async () => {
    await admin?.$disconnect();
    if (!isDatabaseAvailable()) return;
    const testOrgIds = [secondOrgId, dueOrgId, stalledOrgId, futureOnlyOrgId];
    await prisma.outboxEvent.deleteMany({
      where: { orgId: { in: testOrgIds } },
    });
    await prisma.org.deleteMany({ where: { id: { in: testOrgIds } } });
  });

  it("discovers only organisation IDs with due or stalled outbox work", async () => {
    if (!isDatabaseAvailable()) return;
    if (!admin)
      throw new Error("outbox discovery admin client was not created");

    const dueActor = { ...firstOrgActor, orgId: dueOrgId };
    const stalledActor = { ...firstOrgActor, orgId: stalledOrgId };
    const futureActor = { ...firstOrgActor, orgId: futureOnlyOrgId };
    const dueIntent = {
      aggregateType: "user-access",
      aggregateId: randomUUID(),
      eventType: "access.assignment.changed",
      payload: { source: "due-discovery" },
      idempotencyKey: `due-discovery-${randomUUID()}`,
    };
    const futureIntent = {
      ...dueIntent,
      aggregateId: randomUUID(),
      payload: { source: "future-discovery" },
      idempotencyKey: `future-discovery-${randomUUID()}`,
    };
    const stalledIntent = {
      ...dueIntent,
      aggregateId: randomUUID(),
      payload: { source: "stalled-discovery" },
      idempotencyKey: `stalled-discovery-${randomUUID()}`,
    };

    await transactionBoundary().run(dueActor, (tx) =>
      outbox.enqueue(tx, dueIntent),
    );
    await transactionBoundary().run(futureActor, (tx) =>
      tx.outboxEvent.create({
        data: {
          ...futureIntent,
          nextAttemptAt: new Date("2099-01-01T00:00:00.000Z"),
        },
      }),
    );
    await transactionBoundary().run(stalledActor, (tx) =>
      tx.outboxEvent.create({
        data: {
          ...stalledIntent,
          status: "PROCESSING",
          claimedAt: new Date("2000-01-01T00:00:00.000Z"),
        },
      }),
    );

    const discovered = await admin.$queryRaw<{ orgId: string }[]>`
      SELECT * FROM app.list_due_outbox_org_ids()
    `;

    expect(discovered).toContainEqual({ orgId: dueOrgId });
    expect(discovered).toContainEqual({ orgId: stalledOrgId });
    expect(discovered).not.toContainEqual({ orgId: futureOnlyOrgId });

    await expect(
      admin.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `SET LOCAL ROLE "pathway_e2e_outbox_denied"`,
        );
        await tx.$queryRaw`SELECT * FROM app.list_due_outbox_org_ids()`;
      }),
    ).rejects.toThrow("permission denied");
  });

  it("allows one idempotency key in each organisation without leaking either event", async () => {
    if (!isDatabaseAvailable()) return;

    const idempotencyKey = `cross-org-${randomUUID()}`;
    const intent = {
      aggregateType: "user-access",
      aggregateId: randomUUID(),
      eventType: "access.assignment.changed",
      payload: { requestId: firstOrgActor.requestId },
      idempotencyKey,
    };

    const first = await transactionBoundary().run(firstOrgActor, (tx) =>
      outbox.enqueue(tx, intent),
    );
    const second = await transactionBoundary().run(secondOrgActor, (tx) =>
      outbox.enqueue(tx, intent),
    );

    expect(first.id).not.toBe(second.id);
    await transactionBoundary().run(firstOrgActor, async (tx) => {
      await expect(
        tx.outboxEvent.findMany({ where: { idempotencyKey } }),
      ).resolves.toEqual([expect.objectContaining({ id: first.id })]);
      await expect(
        tx.outboxEvent.findFirst({ where: { id: second.id } }),
      ).resolves.toBeNull();
    });
    await transactionBoundary().run(secondOrgActor, async (tx) => {
      await expect(
        tx.outboxEvent.findMany({ where: { idempotencyKey } }),
      ).resolves.toEqual([expect.objectContaining({ id: second.id })]);
      await expect(
        tx.outboxEvent.findFirst({ where: { id: first.id } }),
      ).resolves.toBeNull();
    });
  });
});
