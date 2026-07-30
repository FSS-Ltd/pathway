import { randomUUID } from "node:crypto";
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

  beforeAll(async () => {
    if (!requireDatabase()) return;
    await prisma.org.create({
      data: {
        id: secondOrgId,
        name: `Assignment outbox org ${secondOrgId}`,
        slug: `assignment-outbox-${secondOrgId}`,
        planCode: "trial",
      },
    });
  });

  afterAll(async () => {
    if (!isDatabaseAvailable()) return;
    await prisma.outboxEvent.deleteMany({ where: { orgId: secondOrgId } });
    await prisma.org.deleteMany({ where: { id: secondOrgId } });
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
