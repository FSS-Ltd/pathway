import { runTransaction } from "@pathway/db";
import type { FinanceRecoveryStore } from "./finance-reconciliation-dispatcher";
import {
  financeRecoveryStreams,
  parseFinanceRecoveryWork,
  type FinanceRecoveryWork,
} from "./finance-reconciliation-contracts";
export class PrismaFinanceReconciliationStore implements FinanceRecoveryStore {
  async findDue(
    now: Date,
    livemode: boolean,
    limit: number,
    excluded: readonly string[] = [],
  ): Promise<FinanceRecoveryWork[]> {
    if (
      !Number.isFinite(now.getTime()) ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100 ||
      excluded.length > 500
    )
      throw new RangeError("Invalid recovery discovery bounds");
    for (const key of excluded) {
      const [connectionId, stream, ...extra] = key.split(":");
      if (
        extra.length ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          connectionId ?? "",
        ) ||
        !financeRecoveryStreams.some((candidate) => candidate === stream)
      )
        throw new Error("Invalid recovery exclusion key");
    }
    return runTransaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL statement_timeout = '10000ms'`;
      const rows = await tx.$queryRaw<
        unknown[]
      >`SELECT * FROM app.list_due_finance_reconciliation_scopes(${now},${livemode},${limit}::INTEGER,${[...excluded]}::TEXT[])`;
      if (rows.length > limit)
        throw new Error("Finance recovery discovery exceeded its bound");
      return rows.map(parseFinanceRecoveryWork);
    });
  }
}
