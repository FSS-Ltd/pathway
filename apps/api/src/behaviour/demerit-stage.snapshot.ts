import { evaluateDemeritStage } from "@pathway/ace-domain";
import type { Prisma } from "@pathway/db";
import {
  localDateWindowForDate,
  summariseDemerits,
  toPolicyInput,
} from "./demerit-escalation.support";
import { findActiveDemeritPolicy } from "./demerit-policy.repository";

const STAGE_LABELS = [
  "None",
  "Site review",
  "Guardian notice",
  "Head review",
] as const;

export async function loadDemeritStageSnapshot(
  tx: Prisma.TransactionClient,
  tenantId: string,
  childId: string,
  date: string,
  timezone: string,
  now: Date,
) {
  const day = localDateWindowForDate(date, timezone, 1);
  const asOf = new Date(Math.min(now.getTime(), day.end.getTime() - 1));
  const policy = await findActiveDemeritPolicy(tx, tenantId, asOf);
  if (!policy) return null;
  const window = localDateWindowForDate(date, timezone, policy.windowDays);
  const [entries, manual] = await Promise.all([
    tx.behaviourEntry.findMany({
      where: {
        tenantId,
        childId,
        type: "DEMERIT",
        correction: { is: null },
        occurredAt: { gte: window.start, lte: asOf },
      },
      select: { pointsDelta: true, categoryIsSerious: true, occurredAt: true },
    }),
    tx.demeritStageOverride.findFirst({
      where: {
        tenantId,
        childId,
        demeritPolicyId: policy.id,
        createdAt: { lte: asOf },
        expiresAt: { gt: asOf },
      },
      orderBy: [{ stage: "desc" }, { createdAt: "desc" }],
      select: { stage: true, expiresAt: true },
    }),
  ]);
  const result = evaluateDemeritStage({
    ...toPolicyInput(policy),
    ...summariseDemerits(entries),
    manualStage: manual?.stage,
  });
  return {
    childId,
    date,
    policyId: policy.id,
    policyVersion: policy.version,
    stage: result.stage,
    stageLabel: STAGE_LABELS[result.stage],
    action: result.action,
    requiresNote: result.requiresNote,
    headReview: result.action === "head-review",
    manualStage: manual?.stage ?? null,
    manualExpiresAt: manual?.expiresAt ?? null,
  };
}
