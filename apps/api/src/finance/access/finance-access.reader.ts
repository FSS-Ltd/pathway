import { Module, withTenantRlsContext } from "@pathway/db";

export type FinanceModuleStatus = "ACTIVE" | "CANCELLED" | "EXPIRED";

export interface FinanceModuleAccess {
  status: FinanceModuleStatus;
  expiresAt: Date | null;
}

export interface FinanceAccessScope {
  tenantId: string;
  orgId: string;
}

export interface FinanceAccessReader {
  findModule(scope: FinanceAccessScope): Promise<FinanceModuleAccess | null>;
  hasPayerGrant(
    scope: FinanceAccessScope,
    payerAccountId: string,
    payerUserId: string,
  ): Promise<boolean>;
  hasReceipt(scope: FinanceAccessScope, receiptId: string): Promise<boolean>;
}

export const FINANCE_ACCESS_READER = Symbol("FINANCE_ACCESS_READER");

export const financeAccessReader: FinanceAccessReader = {
  findModule(scope) {
    return withTenantRlsContext(scope.tenantId, scope.orgId, (tx) =>
      tx.orgModule.findUnique({
        where: {
          orgId_module: { orgId: scope.orgId, module: Module.FINANCE },
        },
        select: { status: true, expiresAt: true },
      }),
    );
  },
  async hasPayerGrant(scope, payerAccountId, payerUserId) {
    const grant = await withTenantRlsContext(
      scope.tenantId,
      scope.orgId,
      (tx) =>
        tx.financePayerGrant.findFirst({
          where: {
            financePayerAccountId: payerAccountId,
            payerUserId,
            tenantId: scope.tenantId,
            orgId: scope.orgId,
            revokedAt: null,
          },
          select: { id: true },
        }),
    );
    return grant !== null;
  },
  async hasReceipt(scope, receiptId) {
    const receipt = await withTenantRlsContext(
      scope.tenantId,
      scope.orgId,
      (tx) =>
        tx.financeReceipt.findFirst({
          where: {
            id: receiptId,
            tenantId: scope.tenantId,
            orgId: scope.orgId,
          },
          select: { id: true },
        }),
    );
    return receipt !== null;
  },
};
