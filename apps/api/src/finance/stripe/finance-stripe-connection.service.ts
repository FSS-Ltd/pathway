import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Prisma, withTenantRlsContext } from "@pathway/db";
import { randomUUID } from "node:crypto";
import { FinanceAccessService } from "../access/finance-access.service";
import type { FinanceCountryCode } from "@pathway/platform";
import type { FinanceAccessScope } from "../access/finance-access.reader";
import {
  FINANCE_STRIPE_CONNECT_CONFIG,
  type FinanceStripeConnectConfig,
} from "./finance-stripe-connect.config";
import {
  FINANCE_STRIPE_CONNECT_PROVIDER,
  type FinanceStripeConnectProvider,
  type StripeFinanceAccount,
} from "./finance-stripe-connect.provider";

import { financeStripeAccountStatus } from "./finance-stripe-account-reader.provider";

export interface FinanceStripeConnectionActor extends FinanceAccessScope {
  userId: string;
}

export type FinanceStripeConnectionState =
  | "NOT_CONFIGURED"
  | "NOT_CONNECTED"
  | "CONNECTING"
  | "READY"
  | "RESTRICTED"
  | "DISCONNECTED";

export interface FinanceStripeConnectionView {
  status: FinanceStripeConnectionState;
  livemode: boolean | null;
  canCollect: boolean;
  disconnectedAt: string | null;
}

export interface FinanceStripeOnboardingResult extends FinanceStripeConnectionView {
  onboardingUrl: string | null;
  expiresAt: string | null;
}

@Injectable()
export class FinanceStripeConnectionService {
  constructor(
    @Inject(FinanceAccessService)
    private readonly financeAccess: FinanceAccessService,
    @Inject(FINANCE_STRIPE_CONNECT_CONFIG)
    private readonly config: FinanceStripeConnectConfig,
    @Inject(FINANCE_STRIPE_CONNECT_PROVIDER)
    private readonly provider: FinanceStripeConnectProvider,
  ) {}

  async getStatus(
    actor: FinanceStripeConnectionActor,
  ): Promise<FinanceStripeConnectionView> {
    await this.financeAccess.assertStaffAction(actor, "READ_RECORDS");
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      const profile = await tx.financeProfile.findUnique({
        where: {
          tenantId_orgId: { tenantId: actor.tenantId, orgId: actor.orgId },
        },
        select: { id: true },
      });
      if (!profile) return emptyConnectionState("NOT_CONFIGURED");

      const connection = await tx.financeStripeConnection.findFirst({
        where: {
          financeProfileId: profile.id,
          tenantId: actor.tenantId,
          orgId: actor.orgId,
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: {
          status: true,
          livemode: true,
          disconnectedAt: true,
        },
      });
      return connection
        ? toConnectionView(connection)
        : emptyConnectionState("NOT_CONNECTED");
    });
  }

  async createOnboardingLink(
    actor: FinanceStripeConnectionActor,
  ): Promise<FinanceStripeOnboardingResult> {
    await this.financeAccess.assertStaffAction(
      actor,
      "MANAGE_COLLECTION_ACCOUNT",
    );
    const config = this.requireEnabled();
    const configuredProfile = await this.getFinanceProfile(actor);
    if (!configuredProfile) {
      throw new BadRequestException(
        "Save the school Finance settings before connecting Stripe",
      );
    }
    const connection = await this.getOrCreateConnection(
      actor,
      configuredProfile.id,
      config,
    );
    const profile = await this.getFinanceProfile(actor);
    if (!profile || connection.financeProfileId !== profile.id) {
      throw new ConflictException(
        "Finance settings changed during Stripe setup",
      );
    }

    let accountId = connection.stripeAccountId;
    if (!accountId) {
      const created = await this.provider.createAccount({
        legalEntityName: profile.legalEntityName,
        countryCode: profile.countryCode,
        connectionId: connection.id,
        idempotencyKey: `finance-connect-${connection.id}`,
      });
      this.assertAccountModeAndCountry(
        created,
        config.mode,
        profile.countryCode,
      );
      accountId = created.id;
      await this.saveAccountId(actor, connection.id, accountId);
    }

    const status = await this.refreshStoredConnection(
      actor,
      connection.id,
      accountId,
      config.mode,
      profile.countryCode,
    );
    if (status.status === "READY" || status.status === "DISCONNECTED") {
      return { ...status, onboardingUrl: null, expiresAt: null };
    }

    const link = await this.provider.createOnboardingLink({
      accountId,
      idempotencyKey: randomUUID(),
    });
    const latest = await this.getConnectionById(actor, connection.id);
    if (!latest || latest.status === "DISCONNECTED") {
      throw new ConflictException("Finance Stripe connection was disconnected");
    }
    return {
      ...toConnectionView(latest),
      onboardingUrl: link.url,
      expiresAt: link.expiresAt,
    };
  }

  async refresh(
    actor: FinanceStripeConnectionActor,
  ): Promise<FinanceStripeConnectionView> {
    await this.financeAccess.assertStaffAction(
      actor,
      "MANAGE_COLLECTION_ACCOUNT",
    );
    const config = this.requireEnabled();
    const connection = await this.findActiveConnection(actor);
    if (!connection?.stripeAccountId) {
      return connection
        ? toConnectionView(connection)
        : emptyConnectionState("NOT_CONNECTED");
    }
    const profile = await this.getFinanceProfile(actor);
    if (!profile) throw new NotFoundException("Finance profile not found");
    return this.refreshStoredConnection(
      actor,
      connection.id,
      connection.stripeAccountId,
      config.mode,
      profile.countryCode,
    );
  }

  async disconnect(
    actor: FinanceStripeConnectionActor,
  ): Promise<FinanceStripeConnectionView> {
    await this.financeAccess.assertStaffAction(
      actor,
      "MANAGE_COLLECTION_ACCOUNT",
    );
    const connection = await this.findActiveConnection(actor);
    if (!connection)
      throw new NotFoundException("Finance Stripe connection not found");

    const disconnectedAt = new Date();
    const updated = await withTenantRlsContext(
      actor.tenantId,
      actor.orgId,
      async (tx) => {
        await tx.financeStripeConnection.updateMany({
          where: {
            id: connection.id,
            tenantId: actor.tenantId,
            orgId: actor.orgId,
            status: { not: "DISCONNECTED" },
          },
          data: {
            status: "DISCONNECTED",
            disconnectedByUserId: actor.userId,
            disconnectedAt,
          },
        });
        const current = await tx.financeStripeConnection.findFirst({
          where: {
            id: connection.id,
            tenantId: actor.tenantId,
            orgId: actor.orgId,
          },
          select: {
            status: true,
            livemode: true,
            disconnectedAt: true,
          },
        });
        if (!current)
          throw new NotFoundException("Finance Stripe connection not found");
        return current;
      },
    );
    return toConnectionView(updated);
  }

  private requireEnabled(): Exclude<
    FinanceStripeConnectConfig,
    { mode: "disabled" }
  > {
    if (this.config.mode === "disabled") {
      throw new ServiceUnavailableException("Stripe connection is not enabled");
    }
    return this.config;
  }

  private async getOrCreateConnection(
    actor: FinanceStripeConnectionActor,
    financeProfileId: string,
    config: Exclude<FinanceStripeConnectConfig, { mode: "disabled" }>,
  ) {
    const findActive = () =>
      withTenantRlsContext(actor.tenantId, actor.orgId, (tx) =>
        tx.financeStripeConnection.findFirst({
          where: {
            financeProfileId,
            tenantId: actor.tenantId,
            orgId: actor.orgId,
            status: { not: "DISCONNECTED" },
          },
        }),
      );
    const existing = await findActive();
    if (existing) {
      if (existing.livemode !== (config.mode === "live")) {
        throw new ConflictException("Finance Stripe connection mode mismatch");
      }
      return existing;
    }

    try {
      return await withTenantRlsContext(
        actor.tenantId,
        actor.orgId,
        async (tx) => {
          const profiles = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id" FROM "FinanceProfile"
          WHERE "id" = ${financeProfileId}
            AND "tenantId" = ${actor.tenantId}
            AND "orgId" = ${actor.orgId}
          FOR SHARE
        `;
          if (profiles.length !== 1) {
            throw new NotFoundException("Finance profile not found");
          }
          return tx.financeStripeConnection.create({
            data: {
              financeProfileId,
              tenantId: actor.tenantId,
              orgId: actor.orgId,
              requestedByUserId: actor.userId,
              livemode: config.mode === "live",
            },
          });
        },
      );
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      const raced = await findActive();
      if (raced) return raced;
      throw error;
    }
  }

  private async saveAccountId(
    actor: FinanceStripeConnectionActor,
    connectionId: string,
    accountId: string,
  ): Promise<void> {
    await withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      const result = await tx.financeStripeConnection.updateMany({
        where: {
          id: connectionId,
          tenantId: actor.tenantId,
          orgId: actor.orgId,
          status: { not: "DISCONNECTED" },
          stripeAccountId: null,
        },
        data: { stripeAccountId: accountId },
      });
      if (result.count > 1) {
        throw new Error(
          "Finance Stripe connection update affected multiple rows",
        );
      }
      if (result.count === 0) {
        const current = await tx.financeStripeConnection.findFirst({
          where: {
            id: connectionId,
            tenantId: actor.tenantId,
            orgId: actor.orgId,
          },
          select: { stripeAccountId: true, status: true },
        });
        if (
          !current ||
          current.status === "DISCONNECTED" ||
          current.stripeAccountId !== accountId
        ) {
          throw new ConflictException("Finance Stripe connection changed");
        }
      }
    });
  }

  private async refreshStoredConnection(
    actor: FinanceStripeConnectionActor,
    connectionId: string,
    accountId: string,
    mode: "test" | "live",
    countryCode: FinanceCountryCode,
  ): Promise<FinanceStripeConnectionView> {
    const account = await this.provider.retrieveAccount(accountId);
    this.assertAccountModeAndCountry(account, mode, countryCode);
    const status = financeStripeAccountStatus(account);
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      await tx.financeStripeConnection.updateMany({
        where: {
          id: connectionId,
          tenantId: actor.tenantId,
          orgId: actor.orgId,
          status: { not: "DISCONNECTED" },
        },
        data: { status },
      });
      const connection = await tx.financeStripeConnection.findFirst({
        where: {
          id: connectionId,
          tenantId: actor.tenantId,
          orgId: actor.orgId,
        },
        select: { status: true, livemode: true, disconnectedAt: true },
      });
      if (!connection)
        throw new NotFoundException("Finance Stripe connection not found");
      return toConnectionView(connection);
    });
  }

  private async findActiveConnection(actor: FinanceStripeConnectionActor) {
    return withTenantRlsContext(actor.tenantId, actor.orgId, (tx) =>
      tx.financeStripeConnection.findFirst({
        where: {
          tenantId: actor.tenantId,
          orgId: actor.orgId,
          status: { not: "DISCONNECTED" },
        },
      }),
    );
  }

  private async getFinanceProfile(actor: FinanceStripeConnectionActor) {
    return withTenantRlsContext(actor.tenantId, actor.orgId, (tx) =>
      tx.financeProfile.findUnique({
        where: {
          tenantId_orgId: { tenantId: actor.tenantId, orgId: actor.orgId },
        },
        select: {
          id: true,
          legalEntityName: true,
          countryCode: true,
        },
      }),
    );
  }

  private async getConnectionById(
    actor: FinanceStripeConnectionActor,
    connectionId: string,
  ) {
    return withTenantRlsContext(actor.tenantId, actor.orgId, (tx) =>
      tx.financeStripeConnection.findFirst({
        where: {
          id: connectionId,
          tenantId: actor.tenantId,
          orgId: actor.orgId,
        },
        select: { status: true, livemode: true, disconnectedAt: true },
      }),
    );
  }

  private assertAccountModeAndCountry(
    account: StripeFinanceAccount,
    mode: "test" | "live",
    countryCode: FinanceCountryCode,
  ): void {
    if (
      account.livemode !== (mode === "live") ||
      account.country !== countryCode
    ) {
      throw new ServiceUnavailableException(
        "Stripe account configuration is invalid",
      );
    }
  }
}

function toConnectionView(connection: {
  status: "CONNECTING" | "READY" | "RESTRICTED" | "DISCONNECTED";
  livemode: boolean;
  disconnectedAt: Date | null;
}): FinanceStripeConnectionView {
  return {
    status: connection.status,
    livemode: connection.livemode,
    canCollect: connection.status === "READY",
    disconnectedAt: connection.disconnectedAt?.toISOString() ?? null,
  };
}

function emptyConnectionState(
  status: "NOT_CONFIGURED" | "NOT_CONNECTED",
): FinanceStripeConnectionView {
  return { status, livemode: null, canCollect: false, disconnectedAt: null };
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}
