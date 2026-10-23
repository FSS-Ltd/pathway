import { randomUUID } from "node:crypto";
import { applyTenantContext, prisma, withTenantRlsContext } from "@pathway/db";
import { requireDatabase } from "../../../../test-helpers.e2e";
import { FinanceReconciliationStateRepository } from "../finance-reconciliation-state.repository";
import type {
  FinanceConnectionScope,
  FinanceReconciliationLease,
} from "../finance-reconciliation.types";

const now = new Date("2026-10-23T12:00:00Z");
const repository = new FinanceReconciliationStateRepository();

async function fixture(): Promise<FinanceConnectionScope> {
  const orgId = process.env.E2E_ORG_ID;
  if (!orgId) throw new Error("Missing reconciliation E2E organisation");
  const tenantId = randomUUID();
  const connectionId = randomUUID();
  const stripeAccountId = `acct_${randomUUID().replaceAll("-", "")}`;
  await prisma.$transaction(async (tx) => {
    await tx.tenant.create({
      data: { id: tenantId, orgId, name: "Recovery fixture", slug: tenantId },
    });
    await applyTenantContext(tx, tenantId, orgId);
    const user = await tx.user.create({
      data: { email: `${randomUUID()}@example.test` },
    });
    const profile = await tx.financeProfile.create({
      data: { tenantId, orgId, legalEntityName: "Recovery fixture" },
    });
    await tx.financeStripeConnection.create({
      data: {
        id: connectionId,
        tenantId,
        orgId,
        financeProfileId: profile.id,
        requestedByUserId: user.id,
        stripeAccountId,
      },
    });
  });
  return { connectionId, tenantId, orgId, stripeAccountId, livemode: false };
}

async function state(scope: FinanceConnectionScope) {
  return withTenantRlsContext(scope.tenantId, scope.orgId, (tx) =>
    tx.financeReconciliationState.findFirst({
      where: { stripeConnectionId: scope.connectionId },
    }),
  );
}

function requiredLease(
  lease: FinanceReconciliationLease | null,
): FinanceReconciliationLease {
  if (!lease) throw new Error("Expected reconciliation lease");
  return lease;
}

describe("Finance reconciliation page transactions", () => {
  beforeAll(() => {
    if (!requireDatabase())
      throw new Error("Reconciliation requires a working disposable database");
  });

  it("previews without creating state or cases", async () => {
    const scope = await fixture();
    expect(await repository.preview(scope, "refunds", now)).toMatchObject({
      cursor: null,
      to: now,
    });
    expect(await state(scope)).toBeNull();
    expect(
      await withTenantRlsContext(scope.tenantId, scope.orgId, (tx) =>
        tx.financeReconciliationCase.count({
          where: {
            stripeConnectionId: scope.connectionId,
            tenantId: scope.tenantId,
            orgId: scope.orgId,
          },
        }),
      ),
    ).toBe(0);
  });

  it("persists an independent unresolved-operation lease and fixed cutoff", async () => {
    const scope = await fixture();
    const lease = requiredLease(
      await repository.claim(scope, "unresolvedOperations", now),
    );
    expect(lease.window.from).toEqual(new Date(0));
    expect(lease.window.to).toEqual(now);
    expect(
      await repository.commitPage(
        lease,
        "mandate:operation",
        now,
        async () => {},
      ),
    ).toMatchObject({ kind: "continued" });
    const row = await state(scope);
    expect(row).toMatchObject({
      stream: "unresolvedOperations",
      pageCursor: "mandate:operation",
      completedThrough: null,
    });
  });

  it("keeps SetupIntent discovery coverage separate from unresolved inspection", async () => {
    const scope = await fixture();
    const lease = requiredLease(
      await repository.claim(scope, "setupIntents", now),
    );
    expect(lease.stream).toBe("setupIntents");
    expect(lease.window.from).toEqual(new Date("2026-10-16T12:00:00Z"));
  });

  it("grants only one of two concurrent leases", async () => {
    const scope = await fixture();
    const claims = await Promise.all([
      repository.claim(scope, "refunds", now),
      repository.claim(scope, "refunds", now),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);
  });

  it("rejects a forged account or tenant before claiming", async () => {
    const scope = await fixture();
    await expect(
      repository.claim(
        { ...scope, stripeAccountId: "acct_other" },
        "refunds",
        now,
      ),
    ).rejects.toThrow("scope");
    await expect(
      repository.claim({ ...scope, tenantId: randomUUID() }, "refunds", now),
    ).rejects.toThrow("scope");
    expect(await state(scope)).toBeNull();
  });

  it("persists the page and cursor together and resumes after release", async () => {
    const scope = await fixture();
    const lease = requiredLease(await repository.claim(scope, "refunds", now));
    const result = await repository.commitPage(
      lease,
      "re_page_one",
      now,
      async () => {},
    );
    expect(result.kind).toBe("continued");
    if (result.kind !== "continued")
      throw new Error("Expected continued lease");
    await repository.release(result.lease);
    const next = requiredLease(
      await repository.claim(
        scope,
        "refunds",
        new Date(now.getTime() + 60_000),
      ),
    );
    expect(next.window).toEqual({ ...lease.window, cursor: "re_page_one" });
    expect((await state(scope))?.completedThrough).toBeNull();
    expect(
      await repository.commitPage(
        next,
        null,
        new Date(now.getTime() + 60_000),
        async () => {},
      ),
    ).toEqual({ kind: "completed" });
    expect(await state(scope)).toMatchObject({
      completedThrough: now,
      lastSucceededAt: new Date(now.getTime() + 60_000),
      windowFrom: null,
      pageCursor: null,
      leaseToken: null,
    });
  });

  it("rolls back durable work and cursor when a page fails", async () => {
    const scope = await fixture();
    const lease = requiredLease(await repository.claim(scope, "refunds", now));
    await expect(
      repository.commitPage(lease, "re_lost", now, async (tx) => {
        await tx.financeReconciliationCase.create({
          data: {
            stripeConnectionId: scope.connectionId,
            tenantId: scope.tenantId,
            orgId: scope.orgId,
            caseKey: "rolled-back",
            kind: "UNMATCHED_MONEY",
            details: {},
          },
        });
        throw new Error("Page capture failed");
      }),
    ).rejects.toThrow("Page capture failed");
    expect(await state(scope)).toMatchObject({
      pageCursor: null,
      completedThrough: null,
    });
    expect(
      await withTenantRlsContext(scope.tenantId, scope.orgId, (tx) =>
        tx.financeReconciliationCase.count({
          where: {
            stripeConnectionId: scope.connectionId,
            tenantId: scope.tenantId,
            orgId: scope.orgId,
          },
        }),
      ),
    ).toBe(0);
  });

  it("blocks a crashed worker after another worker reclaims its expired lease", async () => {
    const scope = await fixture();
    const stale = requiredLease(await repository.claim(scope, "refunds", now));
    const later = new Date(now.getTime() + 6 * 60_000);
    const current = requiredLease(
      await repository.claim(scope, "refunds", later),
    );
    expect(current.token).not.toBe(stale.token);
    const persist = jest.fn(async () => {});
    expect(await repository.commitPage(stale, null, later, persist)).toEqual({
      kind: "lost",
    });
    expect(persist).not.toHaveBeenCalled();
    await repository.release(stale);
    expect((await state(scope))?.leaseToken).toBe(current.token);
    expect(await repository.commitPage(current, null, later, persist)).toEqual({
      kind: "completed",
    });
  });

  it("does not write an already committed page a second time", async () => {
    const scope = await fixture();
    const lease = requiredLease(await repository.claim(scope, "refunds", now));
    await repository.commitPage(lease, "re_next", now, async () => {});
    const persist = jest.fn(async () => {});
    expect(await repository.commitPage(lease, null, now, persist)).toEqual({
      kind: "lost",
    });
    expect(persist).not.toHaveBeenCalled();
  });

  it("retains the fixed window and opens a case after an invalid cursor", async () => {
    const scope = await fixture();
    const lease = requiredLease(await repository.claim(scope, "refunds", now));
    const result = await repository.commitPage(
      lease,
      "re_deleted",
      now,
      async () => {},
    );
    if (result.kind !== "continued")
      throw new Error("Expected continued lease");
    await repository.fail(result.lease, "INVALID_CURSOR", now);
    expect(await state(scope)).toMatchObject({
      windowFrom: lease.window.from,
      windowTo: now,
      pageCursor: null,
      completedThrough: null,
      lastError: "INVALID_CURSOR",
      leaseToken: null,
    });
    expect(
      await repository.claim(
        scope,
        "refunds",
        new Date(now.getTime() + 60_000),
      ),
    ).toBeNull();
    const cases = await withTenantRlsContext(
      scope.tenantId,
      scope.orgId,
      (tx) =>
        tx.financeReconciliationCase.findMany({
          where: {
            stripeConnectionId: scope.connectionId,
            tenantId: scope.tenantId,
            orgId: scope.orgId,
          },
        }),
    );
    expect(cases).toMatchObject([{ kind: "COVERAGE_GAP", status: "OPEN" }]);
  });

  it("keeps a retention gap visible after the available period completes", async () => {
    const scope = await fixture();
    await withTenantRlsContext(scope.tenantId, scope.orgId, (tx) =>
      tx.financeReconciliationState.create({
        data: {
          stripeConnectionId: scope.connectionId,
          tenantId: scope.tenantId,
          orgId: scope.orgId,
          stream: "events",
          completedThrough: new Date("2026-09-01T12:00:00Z"),
        },
      }),
    );
    const lease = requiredLease(await repository.claim(scope, "events", now));
    expect(lease.window.gap).not.toBeNull();
    await repository.commitPage(lease, null, now, async () => {});
    const cases = await withTenantRlsContext(
      scope.tenantId,
      scope.orgId,
      (tx) =>
        tx.financeReconciliationCase.findMany({
          where: {
            stripeConnectionId: scope.connectionId,
            tenantId: scope.tenantId,
            orgId: scope.orgId,
          },
          include: { events: true },
        }),
    );
    expect(cases).toMatchObject([
      {
        caseKey: "retention:events",
        status: "OPEN",
        events: [{ type: "DETECTED" }],
      },
    ]);
  });

  it("keeps repeated provider failures in one case and resolves it only after completion", async () => {
    const scope = await fixture();
    const first = requiredLease(await repository.claim(scope, "refunds", now));
    await repository.fail(first, "UNAVAILABLE", now);
    const later = new Date(now.getTime() + 6 * 60_000);
    const second = requiredLease(
      await repository.claim(scope, "refunds", later),
    );
    await repository.fail(second, "UNAVAILABLE", later);
    const recoveryTime = new Date(now.getTime() + 12 * 60_000);
    const recovered = requiredLease(
      await repository.claim(scope, "refunds", recoveryTime),
    );
    await repository.commitPage(recovered, null, recoveryTime, async () => {});
    const cases = await withTenantRlsContext(
      scope.tenantId,
      scope.orgId,
      (tx) =>
        tx.financeReconciliationCase.findMany({
          where: {
            tenantId: scope.tenantId,
            orgId: scope.orgId,
            stripeConnectionId: scope.connectionId,
          },
          include: { events: { orderBy: { createdAt: "asc" } } },
        }),
    );
    expect(cases).toMatchObject([
      {
        caseKey: "provider:refunds",
        status: "RESOLVED",
        events: [{ type: "DETECTED" }, { type: "RESOLVED" }],
      },
    ]);
  });

  it("records capture failures separately and retains their uncommitted cursor", async () => {
    const scope = await fixture();
    const lease = requiredLease(await repository.claim(scope, "refunds", now));
    await repository.fail(lease, "CAPTURE_FAILED", now);
    expect(await state(scope)).toMatchObject({
      completedThrough: null,
      pageCursor: null,
      lastError: "CAPTURE_FAILED",
    });
    const cases = await withTenantRlsContext(
      scope.tenantId,
      scope.orgId,
      (tx) =>
        tx.financeReconciliationCase.findMany({
          where: {
            tenantId: scope.tenantId,
            orgId: scope.orgId,
            stripeConnectionId: scope.connectionId,
          },
        }),
    );
    expect(cases).toMatchObject([
      { caseKey: "capture:refunds", kind: "REPLAY_FAILED", status: "OPEN" },
    ]);
  });
});
