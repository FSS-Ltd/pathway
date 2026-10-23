import type { Prisma } from "@pathway/db";
import type { FinanceRequestActor } from "./finance-controller-support";
import { financeReportRow } from "./finance-report-projection";
import type { FinanceReportRow } from "./finance-report.types";

export async function loadFinanceWebhookExceptions(
  tx: Prisma.TransactionClient,
  scope: Pick<FinanceRequestActor, "tenantId" | "orgId">,
  asOfCutoff: Date,
): Promise<FinanceReportRow[]> {
  const events = await tx.financeStripeWebhookEvent.findMany({
    where: {
      tenantId: scope.tenantId,
      orgId: scope.orgId,
      receivedAt: { lte: asOfCutoff },
      status: { in: ["RETRY", "DEAD_LETTER", "AWAITING_HANDLER"] },
    },
    select: {
      stripeEventId: true,
      eventType: true,
      status: true,
      receivedAt: true,
    },
    orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
  });
  return events.map((event) =>
    financeReportRow({
      recordType: "exceptions",
      reference: event.stripeEventId,
      date: event.receivedAt.toISOString(),
      status: `WEBHOOK_${event.status}`,
      description: `Current payment evidence state needs review: ${event.eventType}. No money is inferred from this event.`,
    }),
  );
}
