import type { Prisma } from "@pathway/db";
import type { DemeritPolicyRecord } from "./demerit-escalation.support";

export function findActiveDemeritPolicy(
  tx: Prisma.TransactionClient,
  tenantId: string,
  instant: Date,
): Promise<DemeritPolicyRecord | null> {
  return tx.demeritPolicy.findFirst({
    where: {
      tenantId,
      effectiveFrom: { lte: instant },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: instant } }],
    },
    orderBy: [{ effectiveFrom: "desc" }, { version: "desc" }],
    select: {
      id: true,
      version: true,
      windowDays: true,
      stageOneThreshold: true,
      stageTwoThreshold: true,
      stageThreeThreshold: true,
      seriousMisconductStage: true,
    },
  });
}
