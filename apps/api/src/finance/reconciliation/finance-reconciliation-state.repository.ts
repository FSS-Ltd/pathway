import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { withTenantRlsContext, type Prisma } from "@pathway/db";
import {
  planReconciliationWindow,
  type FinanceReconciliationWindow,
} from "./finance-reconciliation-window";
import type {
  FinanceConnectionScope,
  FinanceRecoveryStream,
  FinanceReconciliationLease,
  FinanceReconciliationPageCommit,
} from "./finance-reconciliation.types";
import { assertReconciliationScope } from "./finance-reconciliation-scope";
import {
  detectReconciliationCase,
  resolveReconciliationCase,
} from "./finance-reconciliation-case.persistence";

const LEASE_MS = 5 * 60_000;
type FinanceReconciliationState = Prisma.FinanceReconciliationStateGetPayload<
  Record<string, never>
>;

function storedWindow(state: FinanceReconciliationState | null) {
  return {
    active:
      state?.windowFrom && state.windowTo
        ? {
            from: state.windowFrom,
            to: state.windowTo,
            cursor: state.pageCursor,
          }
        : null,
    completedThrough: state?.completedThrough ?? null,
  };
}

async function lockState(
  tx: Prisma.TransactionClient,
  scope: FinanceConnectionScope,
  stream: FinanceRecoveryStream,
): Promise<FinanceReconciliationState | null> {
  const rows = await tx.$queryRaw<FinanceReconciliationState[]>`
    SELECT * FROM "FinanceReconciliationState"
    WHERE "stripeConnectionId" = ${scope.connectionId} AND "stream" = ${stream}
      AND "tenantId" = ${scope.tenantId} AND "orgId" = ${scope.orgId} FOR UPDATE
  `;
  return rows[0] ?? null;
}

function ownsPage(
  state: FinanceReconciliationState | null,
  lease: FinanceReconciliationLease,
  now: Date,
): state is FinanceReconciliationState {
  return (
    !!state &&
    state.id === lease.stateId &&
    state.leaseToken === lease.token &&
    !!state.leaseExpiresAt &&
    state.leaseExpiresAt > now &&
    state.pageCursor === lease.window.cursor &&
    state.windowFrom?.getTime() === lease.window.from.getTime() &&
    state.windowTo?.getTime() === lease.window.to.getTime()
  );
}

@Injectable()
export class FinanceReconciliationStateRepository {
  async preview(
    scope: FinanceConnectionScope,
    stream: FinanceRecoveryStream,
    now: Date,
  ): Promise<FinanceReconciliationWindow | null> {
    return withTenantRlsContext(scope.tenantId, scope.orgId, async (tx) => {
      await assertReconciliationScope(tx, scope);
      const state = await tx.financeReconciliationState.findFirst({
        where: {
          stripeConnectionId: scope.connectionId,
          stream,
          tenantId: scope.tenantId,
          orgId: scope.orgId,
        },
      });
      return planReconciliationWindow(storedWindow(state), stream, now);
    });
  }

  async claim(
    scope: FinanceConnectionScope,
    stream: FinanceRecoveryStream,
    now: Date,
  ): Promise<FinanceReconciliationLease | null> {
    return withTenantRlsContext(scope.tenantId, scope.orgId, async (tx) => {
      await assertReconciliationScope(tx, scope);
      await tx.financeReconciliationState.createMany({
        data: [
          {
            stripeConnectionId: scope.connectionId,
            tenantId: scope.tenantId,
            orgId: scope.orgId,
            stream,
          },
        ],
        skipDuplicates: true,
      });
      const state = await lockState(tx, scope, stream);
      if (!state)
        throw new Error("Finance reconciliation state is unavailable");
      if (
        (state.leaseExpiresAt && state.leaseExpiresAt > now) ||
        (state.retryAfter && state.retryAfter > now)
      )
        return null;
      const window = planReconciliationWindow(storedWindow(state), stream, now);
      if (!window) return null;
      const token = randomUUID();
      await tx.financeReconciliationState.update({
        where: { id: state.id },
        data: {
          windowFrom: window.from,
          windowTo: window.to,
          pageCursor: window.cursor,
          leaseToken: token,
          leaseExpiresAt: new Date(now.getTime() + LEASE_MS),
          retryAfter: null,
        },
      });
      if (window.gap)
        await detectReconciliationCase(
          tx,
          scope,
          {
            key: `retention:${stream}`,
            kind: "COVERAGE_GAP",
            details: {
              stream,
              reason: "event_retention",
              from: window.gap.from.toISOString(),
              to: window.gap.to.toISOString(),
            },
          },
          now,
        );
      return { scope, stream, stateId: state.id, token, window };
    });
  }

  async commitPage(
    lease: FinanceReconciliationLease,
    nextCursor: string | null,
    now: Date,
    persist: (tx: Prisma.TransactionClient) => Promise<void>,
  ): Promise<FinanceReconciliationPageCommit> {
    return withTenantRlsContext(
      lease.scope.tenantId,
      lease.scope.orgId,
      async (tx) => {
        await assertReconciliationScope(tx, lease.scope);
        const state = await lockState(tx, lease.scope, lease.stream);
        if (!ownsPage(state, lease, now)) return { kind: "lost" };
        if (
          nextCursor !== null &&
          (nextCursor.length === 0 ||
            nextCursor.length > 255 ||
            nextCursor === lease.window.cursor)
        )
          throw new Error("Finance reconciliation cursor did not advance");
        await persist(tx);
        if (nextCursor) {
          await tx.financeReconciliationState.update({
            where: { id: state.id },
            data: {
              pageCursor: nextCursor,
              leaseExpiresAt: new Date(now.getTime() + LEASE_MS),
            },
          });
          return {
            kind: "continued",
            lease: {
              ...lease,
              window: { ...lease.window, cursor: nextCursor },
            },
          };
        }
        await tx.financeReconciliationState.update({
          where: { id: state.id },
          data: {
            completedThrough: lease.window.to,
            lastSucceededAt:
              state.lastSucceededAt && state.lastSucceededAt > now
                ? state.lastSucceededAt
                : now,
            windowFrom: null,
            windowTo: null,
            pageCursor: null,
            leaseToken: null,
            leaseExpiresAt: null,
            retryAfter: null,
            lastError: null,
          },
        });
        await resolveReconciliationCase(
          tx,
          lease.scope,
          `provider:${lease.stream}`,
          now,
        );
        await resolveReconciliationCase(
          tx,
          lease.scope,
          `cursor:${lease.stream}`,
          now,
        );
        await resolveReconciliationCase(
          tx,
          lease.scope,
          `capture:${lease.stream}`,
          now,
        );
        return { kind: "completed" };
      },
    );
  }

  async release(lease: FinanceReconciliationLease): Promise<void> {
    await withTenantRlsContext(
      lease.scope.tenantId,
      lease.scope.orgId,
      async (tx) => {
        await assertReconciliationScope(tx, lease.scope);
        await tx.financeReconciliationState.updateMany({
          where: {
            id: lease.stateId,
            tenantId: lease.scope.tenantId,
            orgId: lease.scope.orgId,
            stripeConnectionId: lease.scope.connectionId,
            leaseToken: lease.token,
          },
          data: { leaseToken: null, leaseExpiresAt: null },
        });
      },
    );
  }

  async fail(
    lease: FinanceReconciliationLease,
    reason:
      | "INVALID_CURSOR"
      | "UNAVAILABLE"
      | "INVALID_RESPONSE"
      | "INVALID_SCOPE"
      | "CAPTURE_FAILED",
    now: Date,
  ): Promise<void> {
    await withTenantRlsContext(
      lease.scope.tenantId,
      lease.scope.orgId,
      async (tx) => {
        await assertReconciliationScope(tx, lease.scope);
        const state = await lockState(tx, lease.scope, lease.stream);
        if (!ownsPage(state, lease, now)) return;
        await tx.financeReconciliationState.update({
          where: { id: state.id },
          data: {
            leaseToken: null,
            leaseExpiresAt: null,
            retryAfter: new Date(now.getTime() + LEASE_MS),
            lastError: reason,
            ...(reason === "INVALID_CURSOR" ? { pageCursor: null } : {}),
          },
        });
        await detectReconciliationCase(
          tx,
          lease.scope,
          {
            key: `${reason === "INVALID_CURSOR" ? "cursor" : reason === "CAPTURE_FAILED" ? "capture" : "provider"}:${lease.stream}`,
            kind:
              reason === "INVALID_CURSOR"
                ? "COVERAGE_GAP"
                : reason === "CAPTURE_FAILED"
                  ? "REPLAY_FAILED"
                  : "PROVIDER_UNAVAILABLE",
            details: { stream: lease.stream, reason },
          },
          now,
        );
      },
    );
  }
}
