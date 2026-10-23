import { ConflictException, Inject, Injectable } from "@nestjs/common";
import { withTenantRlsContext, type Prisma } from "@pathway/db";
import {
  FINANCE_STRIPE_ACCOUNT_READER,
  financeStripeAccountStatus,
  type FinanceStripeAccountReader,
} from "./finance-stripe-account-reader.provider";

interface StoredConnection {
  id: string;
  livemode: boolean;
  status: "DISCONNECTED" | "CONNECTING" | "READY" | "RESTRICTED";
  countryCode: string;
}

async function lockConnection(
  tx: Prisma.TransactionClient,
  tenantId: string,
  orgId: string,
  accountId: string,
): Promise<StoredConnection | null> {
  const rows = await tx.$queryRaw<StoredConnection[]>`
    SELECT c."id", c."livemode", c."status", p."countryCode"
    FROM "FinanceStripeConnection" AS c
    INNER JOIN "FinanceProfile" AS p ON p."id" = c."financeProfileId" AND p."tenantId" = c."tenantId" AND p."orgId" = c."orgId"
    WHERE c."tenantId" = ${tenantId} AND c."orgId" = ${orgId} AND c."stripeAccountId" = ${accountId}
    FOR UPDATE OF c
  `;
  return rows[0] ?? null;
}

@Injectable()
export class FinanceStripeAccountSyncService {
  constructor(
    @Inject(FINANCE_STRIPE_ACCOUNT_READER)
    private readonly reader: FinanceStripeAccountReader,
  ) {}
  async refreshFromWebhook(
    tenantId: string,
    orgId: string,
    accountId: string,
  ): Promise<void> {
    const before = await withTenantRlsContext(tenantId, orgId, (tx) =>
      lockConnection(tx, tenantId, orgId, accountId),
    );
    if (!before || before.status === "DISCONNECTED") return;
    const account = await this.reader.retrieveAccount(accountId);
    await withTenantRlsContext(tenantId, orgId, async (tx) => {
      const current = await lockConnection(tx, tenantId, orgId, accountId);
      if (!current || current.status === "DISCONNECTED") return;
      if (
        current.id !== before.id ||
        account.id !== accountId ||
        current.livemode !== account.livemode ||
        current.countryCode !== account.country
      )
        throw new ConflictException(
          "Finance Stripe account does not match current school identity",
        );
      await tx.financeStripeConnection.updateMany({
        where: {
          id: current.id,
          tenantId,
          orgId,
          stripeAccountId: accountId,
          livemode: account.livemode,
          status: { not: "DISCONNECTED" },
        },
        data: { status: financeStripeAccountStatus(account) },
      });
    });
  }
}
