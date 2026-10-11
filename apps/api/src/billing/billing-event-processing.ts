import { ServiceUnavailableException } from "@nestjs/common";
import {
  BillingEventProcessingStatus,
  type BillingProvider,
  Prisma,
  prisma,
} from "@pathway/db";

export type BillingEventClaim =
  | { status: "claimed"; id: string }
  | { status: "duplicate" };

const STALE_PROCESSING_MS = 15 * 60_000;

/** Claim provider identity before applying effects; failed/stale claims can be retried. */
export async function claimBillingEvent(event: {
  provider: BillingProvider;
  eventId: string;
  kind: string;
  orgId: string;
  subscriptionId: string;
}): Promise<BillingEventClaim> {
  try {
    const created = await prisma.billingEvent.create({
      data: {
        provider: event.provider,
        providerEventId: event.eventId,
        type: event.kind,
        orgId: event.orgId && event.orgId !== "pending" ? event.orgId : null,
        processingStatus: BillingEventProcessingStatus.PROCESSING,
        processingStartedAt: new Date(),
        payloadJson: {
          eventId: event.eventId,
          subscriptionId: event.subscriptionId,
        },
      },
      select: { id: true },
    });
    return { status: "claimed", id: created.id };
  } catch (error) {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== "P2002"
    ) {
      throw error;
    }
  }

  const existing = await prisma.billingEvent.findUnique({
    where: {
      provider_providerEventId: {
        provider: event.provider,
        providerEventId: event.eventId,
      },
    },
  });
  if (!existing)
    throw new ServiceUnavailableException(
      "Billing event claim is unavailable.",
    );
  if (existing.processingStatus === BillingEventProcessingStatus.COMPLETED) {
    return { status: "duplicate" };
  }
  const staleBefore = new Date(Date.now() - STALE_PROCESSING_MS);
  const retriable =
    existing.processingStatus === BillingEventProcessingStatus.FAILED ||
    !existing.processingStartedAt ||
    existing.processingStartedAt < staleBefore;
  if (!retriable) {
    throw new ServiceUnavailableException(
      "Billing event is already processing.",
    );
  }
  const claimed = await prisma.billingEvent.updateMany({
    where: {
      id: existing.id,
      processingStatus: existing.processingStatus,
      processingStartedAt: existing.processingStartedAt,
    },
    data: {
      processingStatus: BillingEventProcessingStatus.PROCESSING,
      processingStartedAt: new Date(),
      lastError: null,
    },
  });
  if (claimed.count !== 1) {
    throw new ServiceUnavailableException(
      "Billing event is already processing.",
    );
  }
  return { status: "claimed", id: existing.id };
}

export async function finishBillingEvent(
  id: string,
  orgId: string,
  succeeded: boolean,
): Promise<void> {
  await prisma.billingEvent.update({
    where: { id },
    data: {
      orgId: orgId && orgId !== "pending" ? orgId : null,
      processingStatus: succeeded
        ? BillingEventProcessingStatus.COMPLETED
        : BillingEventProcessingStatus.FAILED,
      processedAt: succeeded ? new Date() : null,
      lastError: succeeded ? null : "processing_failed",
    },
  });
}
