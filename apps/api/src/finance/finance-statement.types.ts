import type { FinanceAccessScope } from "./access/finance-access.reader";

export interface FinanceStatementActor extends FinanceAccessScope {
  userId: string | null;
}
