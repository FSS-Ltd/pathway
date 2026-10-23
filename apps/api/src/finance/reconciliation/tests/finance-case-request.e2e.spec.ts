import { randomUUID } from "node:crypto";
import { prisma, withTenantRlsContext } from "@pathway/db";
import { requireDatabase } from "../../../../test-helpers.e2e";
import type { FinanceConnectionScope } from "../finance-reconciliation.types";
import { FinanceReconciliationStateRepository } from "../finance-reconciliation-state.repository";
import { runFinanceCaseRequestsReconciliation } from "../finance-case-request.runner";
import { readPendingFinanceCaseRequests } from "../finance-case-request.persistence";

const now = new Date("2026-10-23T12:00:00Z");
async function fixture(
  status: "DEAD_LETTER" | "PROCESSING" = "DEAD_LETTER",
  evidenceMode = false,
) {
  const orgId = process.env.E2E_ORG_ID;
  if (!orgId) throw new Error("Missing case request test organisation");
  const tenantId = randomUUID();
  return withTenantRlsContext(tenantId, orgId, async (tx) => {
    await tx.tenant.create({
      data: {
        id: tenantId,
        orgId,
        name: "Synthetic case worker",
        slug: tenantId,
      },
    });
    const user = await tx.user.create({
      data: { email: `${randomUUID()}@example.test` },
    });
    const profile = await tx.financeProfile.create({
      data: { tenantId, orgId, legalEntityName: "Synthetic worker school" },
    });
    const connection = await tx.financeStripeConnection.create({
      data: {
        tenantId,
        orgId,
        financeProfileId: profile.id,
        requestedByUserId: user.id,
        stripeAccountId: `acct_${randomUUID().replaceAll("-", "")}`,
      },
    });
    if (!connection.stripeAccountId)
      throw new Error("Missing synthetic account");
    const scope: FinanceConnectionScope = {
      tenantId,
      orgId,
      connectionId: connection.id,
      stripeAccountId: connection.stripeAccountId,
      livemode: false,
    };
    const record = await tx.financeReconciliationCase.create({
      data: {
        tenantId,
        orgId,
        stripeConnectionId: connection.id,
        caseKey: randomUUID(),
        kind: "REPLAY_FAILED",
        details: {},
        amountMinor: 1000n,
        currency: "GBP",
      },
    });
    const evidence = await tx.financeStripeWebhookEvent.create({
      data: {
        tenantId,
        orgId,
        stripeEventId: `evt_${randomUUID()}`,
        stripeAccountId: connection.stripeAccountId,
        livemode: evidenceMode,
        eventType: "payment_intent.succeeded",
        payloadSha256: "b".repeat(64),
        payloadJson: { object: "synthetic-evidence" },
        status,
        attempts: 10,
        ...(status === "PROCESSING"
          ? { claimToken: randomUUID(), claimedAt: now }
          : {}),
      },
    });
    const requestId = randomUUID();
    const request = await tx.financeReconciliationCaseEvent.create({
      data: {
        caseId: record.id,
        tenantId,
        orgId,
        type: "REPLAY_REQUESTED",
        actorUserId: user.id,
        createdAt: new Date(now.getTime() - 60_000),
        details: { action: "REPLAY", requestId, evidenceId: evidence.id },
      },
    });
    return { scope, record, evidence, request, requestId };
  });
}
function dependencies() {
  return {
    states: new FinanceReconciliationStateRepository(),
    clock: () => now,
    prepareRecheck: async () => {
      throw new Error("Unexpected recheck preparation");
    },
  };
}
async function snapshot(scope: FinanceConnectionScope) {
  return withTenantRlsContext(scope.tenantId, scope.orgId, async (tx) => ({
    evidence: await tx.financeStripeWebhookEvent.findMany({
      where: { tenantId: scope.tenantId },
      orderBy: { id: "asc" },
    }),
    events: await tx.financeReconciliationCaseEvent.findMany({
      where: { tenantId: scope.tenantId },
      orderBy: { id: "asc" },
    }),
    states: await tx.financeReconciliationState.findMany({
      where: { tenantId: scope.tenantId },
      orderBy: { id: "asc" },
    }),
  }));
}
describe("durable Finance case request replay", () => {
  beforeAll(() => {
    if (!requireDatabase())
      throw new Error(
        "Case request tests require a working disposable database",
      );
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });
  it("requeues stored evidence once and audits prior retry history without changing payload or money", async () => {
    const data = await fixture();
    expect(
      await runFinanceCaseRequestsReconciliation(
        { scope: data.scope, mode: "sync" },
        dependencies(),
      ),
    ).toMatchObject({ status: "completed", recoverable: 1 });
    const after = await snapshot(data.scope);
    expect(after.evidence[0]).toMatchObject({
      id: data.evidence.id,
      status: "RETRY",
      attempts: 0,
      nextAttemptAt: now,
      payloadSha256: data.evidence.payloadSha256,
      payloadJson: data.evidence.payloadJson,
    });
    expect(after.events.filter((event) => event.type === "UPDATED")).toEqual([
      expect.objectContaining({
        details: expect.objectContaining({
          completedRequestId: data.requestId,
          outcome: "EVIDENCE_REQUEUED",
          previousAttempts: 10,
          previousStatus: "DEAD_LETTER",
        }),
      }),
    ]);
    await withTenantRlsContext(
      data.scope.tenantId,
      data.scope.orgId,
      async (tx) => {
        expect(
          await readPendingFinanceCaseRequests(
            tx,
            data.scope,
            new Date(now.getTime() + 1000),
            null,
          ),
        ).toEqual({ data: [], nextCursor: null });
        expect(
          await tx.financeReconciliationCase.findUnique({
            where: { id: data.record.id },
          }),
        ).toMatchObject({
          status: "OPEN",
          amountMinor: 1000n,
          resolvedAt: null,
        });
      },
    );
    await runFinanceCaseRequestsReconciliation(
      { scope: data.scope, mode: "sync" },
      { ...dependencies(), clock: () => new Date(now.getTime() + 300_000) },
    );
    expect(
      (await snapshot(data.scope)).events.filter(
        (event) => event.type === "UPDATED",
      ),
    ).toHaveLength(1);
  });
  it("never steals an active canonical processing claim and retains its request", async () => {
    const data = await fixture("PROCESSING");
    expect(
      await runFinanceCaseRequestsReconciliation(
        { scope: data.scope, mode: "sync" },
        dependencies(),
      ),
    ).toMatchObject({ status: "failed", reason: "CAPTURE_FAILED" });
    const after = await snapshot(data.scope);
    expect(after.evidence[0]).toEqual(data.evidence);
    expect(after.events.some((event) => event.type === "UPDATED")).toBe(false);
    expect(after.states[0]).toMatchObject({
      lastError: "CAPTURE_FAILED",
      completedThrough: null,
    });
  });
  it("dry run reports requests without inbox, event or cursor writes", async () => {
    const data = await fixture();
    const before = await snapshot(data.scope);
    expect(
      await runFinanceCaseRequestsReconciliation(
        { scope: data.scope, mode: "dry-run" },
        dependencies(),
      ),
    ).toMatchObject({ status: "completed", objects: 1, recoverable: 1 });
    expect(await snapshot(data.scope)).toEqual(before);
  });
  it("rejects evidence from another environment without completing the request", async () => {
    const data = await fixture("DEAD_LETTER", true);
    expect(
      await runFinanceCaseRequestsReconciliation(
        { scope: data.scope, mode: "sync" },
        dependencies(),
      ),
    ).toMatchObject({ status: "failed", reason: "CAPTURE_FAILED" });
    const after = await snapshot(data.scope);
    expect(after.evidence[0]).toEqual(data.evidence);
    expect(after.events.some((event) => event.type === "UPDATED")).toBe(false);
  });
});
