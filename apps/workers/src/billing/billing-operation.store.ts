import { applyTenantContext, runTransaction, type Prisma } from "@pathway/db";

export interface ClaimedBillingOperation {
  id: string;
  orgId: string;
  attempts: number;
  dueAt: Date;
  claimToken: string;
}

export interface BillingOperationStore {
  claim(
    now: Date,
    leaseUntil: Date,
    token: string,
    limit: number,
  ): Promise<ClaimedBillingOperation[]>;
  complete(operation: ClaimedBillingOperation, now: Date): Promise<boolean>;
  retry(
    operation: ClaimedBillingOperation,
    dueAt: Date,
    error: string,
  ): Promise<boolean>;
  review(operation: ClaimedBillingOperation, error: string): Promise<boolean>;
  alertCounts(before: Date): Promise<{ overdue: number; needsReview: number }>;
}

export class PrismaBillingOperationStore implements BillingOperationStore {
  async claim(
    now: Date,
    leaseUntil: Date,
    token: string,
    limit: number,
  ): Promise<ClaimedBillingOperation[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      throw new RangeError("Invalid claim limit");
    const orgIds = await runTransaction(async (tx) => {
      const rows = await tx.$queryRaw<{ orgId: string }[]>`
        SELECT "orgId" FROM app.list_due_institutional_billing_org_ids(${now})
      `;
      return rows.map((row) => row.orgId);
    });
    const claimed: ClaimedBillingOperation[] = [];
    for (const orgId of orgIds) {
      if (claimed.length >= limit) break;
      const remaining = limit - claimed.length;
      const rows = await this.forOrg(
        orgId,
        (tx) => tx.$queryRaw<ClaimedBillingOperation[]>`
        WITH due AS (
          SELECT "id" FROM "InstitutionalBillingOperation"
          WHERE "orgId" = ${orgId}
            AND (("status" IN ('PENDING', 'RETRY') AND "dueAt" <= (${now} AT TIME ZONE 'UTC'))
              OR ("status" = 'CLAIMED' AND "claimedUntil" <= (${now} AT TIME ZONE 'UTC')))
          ORDER BY "dueAt", "id"
          FOR UPDATE SKIP LOCKED
          LIMIT ${remaining}
        )
        UPDATE "InstitutionalBillingOperation" AS op
        SET "status" = 'CLAIMED', "attempts" = op."attempts" + 1,
            "claimToken" = ${token}, "claimedUntil" = (${leaseUntil} AT TIME ZONE 'UTC'), "updatedAt" = (${now} AT TIME ZONE 'UTC')
        FROM due WHERE op."id" = due."id"
        RETURNING op."id", op."orgId", op."attempts", op."dueAt", op."claimToken"
      `,
      );
      claimed.push(...rows);
    }
    return claimed;
  }

  async complete(
    operation: ClaimedBillingOperation,
    now: Date,
  ): Promise<boolean> {
    return this.updateClaim(operation, {
      status: "COMPLETED",
      completedAt: now,
      claimToken: null,
      claimedUntil: null,
      lastError: null,
    });
  }

  async retry(
    operation: ClaimedBillingOperation,
    dueAt: Date,
    error: string,
  ): Promise<boolean> {
    return this.updateClaim(operation, {
      status: "RETRY",
      dueAt,
      claimToken: null,
      claimedUntil: null,
      lastError: error,
    });
  }

  async review(
    operation: ClaimedBillingOperation,
    error: string,
  ): Promise<boolean> {
    return this.updateClaim(operation, {
      status: "REVIEW_REQUIRED",
      claimToken: null,
      claimedUntil: null,
      lastError: error,
    });
  }

  async alertCounts(
    before: Date,
  ): Promise<{ overdue: number; needsReview: number }> {
    const rows = await runTransaction(
      (tx) => tx.$queryRaw<
        {
          overdue: bigint;
          needs_review: bigint;
        }[]
      >`
      SELECT overdue, needs_review FROM app.institutional_billing_alert_counts(${before})
    `,
    );
    return {
      overdue: Number(rows[0]?.overdue ?? 0),
      needsReview: Number(rows[0]?.needs_review ?? 0),
    };
  }

  private async updateClaim(
    operation: ClaimedBillingOperation,
    data: Prisma.InstitutionalBillingOperationUpdateManyMutationInput,
  ): Promise<boolean> {
    const result = await this.forOrg(operation.orgId, (tx) =>
      tx.institutionalBillingOperation.updateMany({
        where: {
          id: operation.id,
          orgId: operation.orgId,
          status: "CLAIMED",
          claimToken: operation.claimToken,
        },
        data,
      }),
    );
    return result.count === 1;
  }

  private forOrg<T>(
    orgId: string,
    callback: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return runTransaction(async (tx) => {
      await applyTenantContext(tx, "", orgId);
      return callback(tx);
    });
  }
}
