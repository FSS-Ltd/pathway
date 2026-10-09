import { Prisma } from "@pathway/db";
import type { BehaviourActor } from "./behaviour-command.service";

export type ReviewKind = "SITE" | "HEAD";

export async function findActiveReviewers(
  tx: Prisma.TransactionClient,
  actor: Pick<BehaviourActor, "tenantId" | "orgId">,
  kind: ReviewKind,
  now: Date,
): Promise<string[]> {
  const reviewers = await tx.$queryRaw<Array<{ userId: string }>>(Prisma.sql`
    SELECT "userId"
    FROM app.ace_behaviour_active_reviewers(
      ${actor.tenantId}, ${actor.orgId}, ${kind}, ${now}
    )
  `);
  return reviewers.map(({ userId }) => userId).sort();
}

export async function currentReviewerKinds(
  tx: Prisma.TransactionClient,
  actor: BehaviourActor,
  now: Date,
): Promise<ReviewKind[]> {
  const [head, site] = await Promise.all([
    findActiveReviewers(tx, actor, "HEAD", now),
    findActiveReviewers(tx, actor, "SITE", now),
  ]);
  return [
    ...(head.includes(actor.userId) ? (["HEAD"] as const) : []),
    ...(site.includes(actor.userId) ? (["SITE"] as const) : []),
  ];
}
