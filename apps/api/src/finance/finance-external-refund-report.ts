import type { Prisma } from "@pathway/db";
import type { FinanceRequestActor } from "./finance-controller-support";
import { financeReportRow } from "./finance-report-projection";
import type { FinanceReportRow } from "./finance-report.types";

export async function loadFinanceExternalRefundReviews(
  tx: Prisma.TransactionClient,
  scope: Pick<FinanceRequestActor, "tenantId" | "orgId">,
  asOfCutoff: Date,
): Promise<{ rows: FinanceReportRow[]; amountsMinor: bigint[] }> {
  const cases = await tx.financeReconciliationCase.findMany({
    where: {
      tenantId: scope.tenantId,
      orgId: scope.orgId,
      createdAt: { lte: asOfCutoff },
      status: { in: ["OPEN", "ACKNOWLEDGED"] },
      kind: "UNKNOWN_OPERATION",
      details: {
        path: ["reason"],
        equals: "EXTERNAL_REFUND_PENDING_TREATMENT",
      },
    },
    select: {
      id: true,
      resourceReference: true,
      createdAt: true,
      amountMinor: true,
      currency: true,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  return {
    rows: cases.map((item) =>
      financeReportRow({
        recordType: "exceptions",
        reference: item.resourceReference ?? item.id,
        date: item.createdAt.toISOString(),
        status: "EXTERNAL_REFUND_REVIEW",
        amountMinor: item.amountMinor?.toString() ?? null,
        currency: item.currency,
        description:
          "Externally confirmed refund reopened debt. Review the school's treatment before assuming a credit.",
      }),
    ),
    amountsMinor: cases.flatMap((item) =>
      item.amountMinor === null ? [] : [item.amountMinor],
    ),
  };
}
