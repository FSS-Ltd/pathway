import { createHash, randomUUID } from "node:crypto";
import type { Prisma } from "@pathway/db";
import type { FinanceConnectionScope } from "./finance-reconciliation.types";

export interface FinanceApiEvidence {
  eventId: string;
  eventType: string;
  payload: Prisma.InputJsonObject;
  digest: string;
}

export function makeFinanceApiEvidence(
  scope: FinanceConnectionScope,
  eventType: string,
  object: Prisma.InputJsonObject,
  observedAt: Date,
): FinanceApiEvidence {
  const identity = JSON.stringify({
    connectionId: scope.connectionId,
    account: scope.stripeAccountId,
    livemode: scope.livemode,
    eventType,
    object,
  });
  const eventId = `recovery_${createHash("sha256").update(identity).digest("hex")}`;
  const payload = {
    id: eventId,
    type: eventType,
    account: scope.stripeAccountId,
    livemode: scope.livemode,
    created: Math.floor(observedAt.getTime() / 1000),
    data: { object },
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
