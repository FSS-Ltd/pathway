import { ConflictException, Inject, Injectable } from "@nestjs/common";
import { Prisma, withTenantRlsContext } from "@pathway/db";
import {
  FINANCE_COUNTRY_CURRENCY_OPTIONS,
  type FinanceCurrency,
  type FinanceCountryCode,
} from "@pathway/platform";
import { FinanceAccessService } from "./access/finance-access.service";
import type { FinanceRequestActor } from "./finance-controller-support";
import type { FinanceProfileSettingsInput } from "./dto/finance-profile.dto";

type FinanceProfileFields = {
  legalEntityName: string;
  countryCode: FinanceCountryCode;
  currency: FinanceCurrency;
};

type FinanceProfileSettingsView = {
  profile: FinanceProfileFields | null;
  countries: typeof FINANCE_COUNTRY_CURRENCY_OPTIONS;
  configurationLocked: boolean;
};

@Injectable()
export class FinanceProfileService {
  constructor(
    @Inject(FinanceAccessService)
    private readonly financeAccess: FinanceAccessService,
  ) {}

  async getSettings(
    actor: FinanceRequestActor,
  ): Promise<FinanceProfileSettingsView> {
    await this.financeAccess.assertStaffAction(actor, "READ_RECORDS");
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      const profile = await tx.financeProfile.findUnique({
        where: {
          tenantId_orgId: { tenantId: actor.tenantId, orgId: actor.orgId },
        },
        select: {
          legalEntityName: true,
          countryCode: true,
          currency: true,
        },
      });
      return {
        profile,
        countries: FINANCE_COUNTRY_CURRENCY_OPTIONS,
        configurationLocked: profile
          ? await hasSettingsLockingActivity(tx, actor)
          : false,
      };
    });
  }

  async saveSettings(
    actor: FinanceRequestActor,
    input: FinanceProfileSettingsInput,
  ): Promise<FinanceProfileFields> {
    await this.financeAccess.assertStaffAction(
      actor,
      "MANAGE_COLLECTION_ACCOUNT",
    );
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "FinanceProfile"
        WHERE "tenantId" = ${actor.tenantId} AND "orgId" = ${actor.orgId}
        FOR UPDATE
      `;
      const current = await tx.financeProfile.findUnique({
        where: {
          tenantId_orgId: { tenantId: actor.tenantId, orgId: actor.orgId },
        },
        select: {
          id: true,
          legalEntityName: true,
          countryCode: true,
          currency: true,
        },
      });

      if (current) {
        const sameSettings =
          current.legalEntityName === input.legalEntityName &&
          current.countryCode === input.countryCode &&
          current.currency === input.currency;
        if (sameSettings) return toProfileSettings(current);

        if (
          locked.length !== 1 ||
          (await hasSettingsLockingActivity(tx, actor))
        ) {
          throw new ConflictException(
            "School country and currency are locked after Finance activity or Stripe setup",
          );
        }

        const updated = await tx.financeProfile.update({
          where: { id: current.id },
          data: input,
          select: {
            legalEntityName: true,
            countryCode: true,
            currency: true,
          },
        });
        return toProfileSettings(updated);
      }

      try {
        const created = await tx.financeProfile.create({
          data: {
            tenantId: actor.tenantId,
            orgId: actor.orgId,
            ...input,
          },
          select: {
            legalEntityName: true,
            countryCode: true,
            currency: true,
          },
        });
        return toProfileSettings(created);
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          throw new ConflictException(
            "Finance settings changed in another session. Refresh and try again.",
          );
        }
        throw error;
      }
    });
  }
}

function toProfileSettings(
  profile: FinanceProfileFields,
): FinanceProfileFields {
  return {
    legalEntityName: profile.legalEntityName,
    countryCode: profile.countryCode,
    currency: profile.currency,
  };
}

async function hasSettingsLockingActivity(
  tx: Prisma.TransactionClient,
  actor: FinanceRequestActor,
): Promise<boolean> {
  const scope = { tenantId: actor.tenantId, orgId: actor.orgId };
  const [
    invoices,
    credits,
    receipts,
    connections,
    transferChanges,
    statements,
  ] = await Promise.all([
    tx.financeInvoice.count({ where: scope }),
    tx.financeCreditNote.count({ where: scope }),
    tx.financeReceipt.count({ where: scope }),
    tx.financeStripeConnection.count({ where: scope }),
    tx.financeBankTransferChange.count({ where: scope }),
    tx.financeStatement.count({ where: scope }),
  ]);
  return (
    invoices > 0 ||
    credits > 0 ||
    receipts > 0 ||
    connections > 0 ||
    transferChanges > 0 ||
    statements > 0
  );
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}
