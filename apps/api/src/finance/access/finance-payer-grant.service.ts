import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, withTenantRlsContext } from "@pathway/db";
import type { FinanceAccessScope } from "./finance-access.reader";

export interface FinancePayerGrantResult {
  id: string;
  payerUserId: string;
  grantedAt: Date;
}

@Injectable()
export class FinancePayerGrantService {
  async grant(
    scope: FinanceAccessScope,
    payerAccountId: string,
    payerUserId: string,
    grantedByUserId: string,
  ): Promise<FinancePayerGrantResult> {
    try {
      return await withTenantRlsContext(
        scope.tenantId,
        scope.orgId,
        async (tx) => {
          const account = await tx.financePayerAccount.findFirst({
            where: {
              id: payerAccountId,
              tenantId: scope.tenantId,
              orgId: scope.orgId,
            },
            select: { id: true },
          });
          if (!account)
            throw new NotFoundException("Finance account not found");

          const existing = await tx.financePayerGrant.findFirst({
            where: {
              financePayerAccountId: payerAccountId,
              payerUserId,
              tenantId: scope.tenantId,
              orgId: scope.orgId,
              revokedAt: null,
            },
            select: { id: true, payerUserId: true, grantedAt: true },
          });
          if (existing) return existing;

          return tx.financePayerGrant.create({
            data: {
              financePayerAccountId: payerAccountId,
              tenantId: scope.tenantId,
              orgId: scope.orgId,
              payerUserId,
              grantedByUserId,
            },
            select: { id: true, payerUserId: true, grantedAt: true },
          });
        },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictException("Payer access already exists");
      }
      throw error;
    }
  }

  async revoke(
    scope: FinanceAccessScope,
    payerAccountId: string,
    grantId: string,
    revokedByUserId: string,
  ): Promise<void> {
    await withTenantRlsContext(scope.tenantId, scope.orgId, async (tx) => {
      const account = await tx.financePayerAccount.findFirst({
        where: {
          id: payerAccountId,
          tenantId: scope.tenantId,
          orgId: scope.orgId,
        },
        select: { id: true },
      });
      if (!account) throw new NotFoundException("Finance account not found");

      const result = await tx.financePayerGrant.updateMany({
        where: {
          id: grantId,
          financePayerAccountId: payerAccountId,
          tenantId: scope.tenantId,
          orgId: scope.orgId,
          revokedAt: null,
        },
        data: { revokedAt: new Date(), revokedByUserId },
      });
      if (result.count !== 1) {
        throw new NotFoundException("Finance payer grant not found");
      }
    });
  }
}
