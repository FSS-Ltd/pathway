import { Prisma } from "@pathway/db";
import type { FinanceReconciliationObject } from "../stripe/finance-stripe-reconciliation.provider";
import type { FinanceConnectionScope } from "./finance-reconciliation.types";
import type { FinanceReconciliationPageSummary } from "./finance-reconciliation-runner";
import type { FinanceStripeCheckoutEventType } from "../stripe/finance-stripe-checkout-events";
import { financeReconciliationCaseKey } from "./finance-reconciliation-case-key";
import {
  checkoutRecoveryMismatch,
  projectFinanceCheckout,
  type FinanceRecoveredCheckout,
} from "./finance-checkout-recovery.contracts";
import {
  captureFinanceApiEvidence,
  makeFinanceApiEvidence,
} from "./finance-api-evidence.persistence";
import {
  detectReconciliationCase,
  resolveReconciliationCase,
} from "./finance-reconciliation-case.persistence";

type Attempt = Prisma.FinanceCheckoutAttemptGetPayload<Record<string, never>>;
export interface FinanceCheckoutRecoveryOrigin {
  id: string;
  created: number;
  eventType: FinanceStripeCheckoutEventType;
}

function checkoutUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.origin === "https://checkout.stripe.com" &&
      !url.username &&
      !url.password
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

async function findAttempt(
  tx: Prisma.TransactionClient,
  scope: FinanceConnectionScope,
  checkout: FinanceRecoveredCheckout,
  mode: "capture" | "dry-run",
): Promise<Attempt | null> {
  const id = checkout.metadata.finance_checkout_attempt_id;
  if (!id) return null;
  if (mode === "dry-run")
    return tx.financeCheckoutAttempt.findFirst({
      where: {
        id,
        tenantId: scope.tenantId,
        orgId: scope.orgId,
        stripeConnectionId: scope.connectionId,
      },
    });
  const rows = await tx.$queryRaw<Attempt[]>`
    SELECT * FROM "FinanceCheckoutAttempt" WHERE "id" = ${id} AND "tenantId" = ${scope.tenantId}
      AND "orgId" = ${scope.orgId} AND "stripeConnectionId" = ${scope.connectionId} FOR UPDATE
  `;
  return rows[0] ?? null;
}

/** Caller validates the stored connection scope once per page, before processing its objects. */
export async function recoverFinanceCheckout(
  tx: Prisma.TransactionClient,
  scope: FinanceConnectionScope,
  object: FinanceReconciliationObject,
  now: Date,
  mode: "capture" | "dry-run",
  origin?: FinanceCheckoutRecoveryOrigin,
): Promise<FinanceReconciliationPageSummary> {
  const checkout = projectFinanceCheckout(object);
  const attempt = checkout
    ? await findAttempt(tx, scope, checkout, mode)
    : null;
  let mismatch: string | null = !checkout
    ? "INVALID_CHECKOUT"
    : !attempt
      ? "UNKNOWN_OPERATION"
      : checkoutRecoveryMismatch(scope, attempt, checkout);
  const url = checkout?.status === "open" ? checkoutUrl(object.url) : null;
  if (
    !mismatch &&
    checkout?.status === "open" &&
    (!url || checkout.expires_at * 1000 <= now.getTime())
  )
    mismatch = "OPEN_SESSION_NEEDS_REVIEW";

  if (mismatch || !checkout || !attempt) {
    if (mode === "capture") {
      const facts = checkout
        ? { ...checkout }
        : {
            id: object.id,
            object: object.object,
            created: object.created,
            livemode: scope.livemode,
          };
      const evidence = makeFinanceApiEvidence(
        scope,
        origin?.eventType ?? "finance.reconciliation.checkout.unmatched",
        facts,
        now,
        origin
          ? { kind: "provider-event", id: origin.id, created: origin.created }
          : undefined,
      );
      await captureFinanceApiEvidence(tx, scope, evidence, "hold", now);
      const paid = checkout?.payment_status === "paid";
      await detectReconciliationCase(
        tx,
        scope,
        {
          key: financeReconciliationCaseKey(
            "checkout",
            object.id,
            paid ? "money" : "operation",
          ),
          kind: paid ? "UNMATCHED_MONEY" : "UNKNOWN_OPERATION",
          resourceReference: object.id,
          ...(checkout
            ? {
                money: {
                  amountMinor: BigInt(checkout.amount_total),
                  currency: checkout.currency.toUpperCase(),
                },
              }
            : {}),
          details: {
            reason: mismatch ?? "UNKNOWN_OPERATION",
            evidenceEventId: evidence.eventId,
            fundsConfirmed: paid,
          },
        },
        now,
      );
    }
    return { recoverable: 0, exceptions: 1 };
  }
  if (mode === "dry-run") return { recoverable: 1, exceptions: 0 };

  if (!attempt.stripeCheckoutSessionId) {
    await tx.financeCheckoutAttempt.updateMany({
      where: {
        id: attempt.id,
        tenantId: scope.tenantId,
        orgId: scope.orgId,
        stripeConnectionId: scope.connectionId,
        stripeCheckoutSessionId: null,
      },
      data: {
        stripeCheckoutSessionId: checkout.id,
        stripePaymentIntentId:
          checkout.payment_intent ?? attempt.stripePaymentIntentId,
        expiresAt: new Date(checkout.expires_at * 1000),
        ...(attempt.status === "CREATING"
          ? {
              status:
                checkout.status === "open"
                  ? "OPEN"
                  : checkout.status === "expired"
                    ? "EXPIRED"
                    : "COMPLETED",
            }
          : {}),
        checkoutUrl: checkout.status === "open" ? url : null,
      },
    });
  }
  const eventType =
    origin?.eventType ??
    (checkout.status === "complete"
      ? "checkout.session.completed"
      : checkout.status === "expired"
        ? "checkout.session.expired"
        : "finance.reconciliation.checkout.open_observed");
  const evidence = makeFinanceApiEvidence(
    scope,
    eventType,
    { ...checkout },
    now,
    origin
      ? { kind: "provider-event", id: origin.id, created: origin.created }
      : undefined,
  );
  await captureFinanceApiEvidence(
    tx,
    scope,
    evidence,
    checkout.status === "open" ? "observed" : "queue",
    now,
  );
  await resolveReconciliationCase(
    tx,
    scope,
    financeReconciliationCaseKey("checkout", checkout.id, "money"),
    now,
    "provider_operation_recovered",
  );
  await resolveReconciliationCase(
    tx,
    scope,
    financeReconciliationCaseKey("checkout", checkout.id, "operation"),
    now,
    "provider_operation_recovered",
  );
  await resolveReconciliationCase(
    tx,
    scope,
    `operation:checkout:${attempt.id}`,
    now,
    "provider_operation_recovered",
  );
  return { recoverable: 1, exceptions: 0 };
}
