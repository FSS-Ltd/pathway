import { createHash, randomUUID } from "node:crypto";
import type { Prisma } from "@pathway/db";
import type { FinanceConnectionScope } from "./finance-reconciliation.types";

export interface FinanceApiEvidence {
  eventId: string;
  eventType: string;
  payload: Prisma.InputJsonObject;
  digest: string;
}

export type FinanceApiEvidenceOrigin =
  | { kind: "current-object" }
  | { kind: "provider-event"; id: string; created: number }
  | { kind: "balance-transaction"; id: string; created: number };

export function makeFinanceApiEvidence(
  scope: FinanceConnectionScope,
  eventType: string,
  object: Prisma.InputJsonObject,
  observedAt: Date,
  origin: FinanceApiEvidenceOrigin = { kind: "current-object" },
): FinanceApiEvidence {
  if (origin.kind !== "current-object") {
    const prefix = origin.kind === "provider-event" ? "evt_" : "txn_";
    if (
      !origin.id.startsWith(prefix) ||
      origin.id.length > 255 ||
      !/^[A-Za-z0-9_]+$/.test(origin.id) ||
      !Number.isSafeInteger(origin.created) ||
      origin.created <= 0 ||
      origin.created > 8_640_000_000_000
    )
      throw new Error("Finance provider evidence origin is invalid");
  }
  const identity = JSON.stringify({
    connectionId: scope.connectionId,
    account: scope.stripeAccountId,
    livemode: scope.livemode,
    eventType,
    object,
    ...(origin.kind === "balance-transaction" ? { movementId: origin.id } : {}),
  });
  const eventId =
    origin.kind === "provider-event"
      ? origin.id
      : `recovery_${createHash("sha256").update(identity).digest("hex")}`;
  const payload = {
    id: eventId,
    type: eventType,
    account: scope.stripeAccountId,
    livemode: scope.livemode,
    created:
      origin.kind === "current-object"
        ? Math.floor(observedAt.getTime() / 1000)
        : origin.created,
    data: { object },
    reconciliation: {
      basis: origin.kind,
      ...(origin.kind !== "current-object"
        ? { source_reference: origin.id }
        : {}),
      observed_at: observedAt.toISOString(),
    },
  };
  return {
    eventId,
    eventType,
    payload,
    digest: createHash("sha256").update(JSON.stringify(payload)).digest("hex"),
  };
}

export async function captureFinanceApiEvidence(
  tx: Prisma.TransactionClient,
  scope: FinanceConnectionScope,
  evidence: FinanceApiEvidence,
  disposition: "queue" | "hold" | "observed",
  now: Date,
): Promise<void> {
  await tx.financeStripeWebhookEvent.createMany({
    data: [
      {
        id: randomUUID(),
        tenantId: scope.tenantId,
        orgId: scope.orgId,
        stripeAccountId: scope.stripeAccountId,
        livemode: scope.livemode,
        reconciliationConnectionId: scope.connectionId,
        evidenceSource: "API_RECONCILIATION",
        stripeEventId: evidence.eventId,
        eventType: evidence.eventType,
        payloadJson: evidence.payload,
        payloadSha256: evidence.digest,
        status:
          disposition === "queue"
            ? "RECEIVED"
            : disposition === "hold"
              ? "AWAITING_HANDLER"
              : "COMPLETED",
        processedAt: disposition === "observed" ? now : null,
        receivedAt: now,
        nextAttemptAt: now,
      },
    ],
    skipDuplicates: true,
  });
  const stored = await tx.financeStripeWebhookEvent.findFirst({
    where: {
      stripeEventId: evidence.eventId,
      tenantId: scope.tenantId,
      orgId: scope.orgId,
      stripeAccountId: scope.stripeAccountId,
      livemode: scope.livemode,
      eventType: evidence.eventType,
    },
    select: { id: true, status: true },
  });
  if (!stored)
    throw new Error("Recovered Stripe evidence conflicts with stored scope");
  if (disposition === "queue" && stored.status === "AWAITING_HANDLER")
    await tx.financeStripeWebhookEvent.updateMany({
      where: {
        id: stored.id,
        tenantId: scope.tenantId,
        orgId: scope.orgId,
        status: "AWAITING_HANDLER",
      },
      data: { status: "RETRY", nextAttemptAt: now, lastError: null },
    });
}
