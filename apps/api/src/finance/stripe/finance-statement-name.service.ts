import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { withTenantRlsContext } from "@pathway/db";
import { EffectivePermissionsService } from "../../access-control/effective-permissions.service";
import { FinanceAccessService } from "../access/finance-access.service";
import type { FinanceRequestActor } from "../finance-controller-support";
import {
  FINANCE_STATEMENT_NAME_READER,
  type FinanceStatementNameReader,
} from "./finance-statement-name-reader.provider";

export type FinanceStatementNameView =
  | { status: "NOT_CONFIGURED" | "NOT_CONNECTED" | "DISCONNECTED" }
  | {
      status: "CONNECTED";
      schoolName: string;
      accountReference: string;
      descriptor: string | null;
      checkedAt: string;
      canPrepare: boolean;
      livemode: boolean;
    };

@Injectable()
export class FinanceStatementNameService {
  constructor(
    @Inject(FinanceAccessService) private readonly access: FinanceAccessService,
    @Inject(EffectivePermissionsService)
    private readonly permissions: EffectivePermissionsService,
    @Inject(FINANCE_STATEMENT_NAME_READER)
    private readonly reader: FinanceStatementNameReader,
  ) {}

  async get(actor: FinanceRequestActor): Promise<FinanceStatementNameView> {
    await this.assertRead(actor);
    const state = await this.findConnection(actor);
    if (!state.profile) return { status: "NOT_CONFIGURED" };
    if (!state.connection?.stripeAccountId) return { status: "NOT_CONNECTED" };
    if (state.connection.status === "DISCONNECTED")
      return { status: "DISCONNECTED" };
    const { profile, connection } = state;
    const accountId = connection.stripeAccountId;
    if (!accountId) return { status: "NOT_CONNECTED" };
    const account = await this.reader.retrieve(accountId);
    await this.assertRead(actor);
    const latest = await this.findConnection(actor);
    if (
      latest.connection?.id !== connection.id ||
      latest.connection.status === "DISCONNECTED" ||
      latest.connection.stripeAccountId !== account.id ||
      latest.connection.livemode !== connection.livemode ||
      latest.profile?.id !== profile.id
    ) {
      throw new ConflictException(
        "School Stripe connection changed. Check again.",
      );
    }
    if (
      account.id !== connection.stripeAccountId ||
      account.livemode !== connection.livemode ||
      account.country !== profile.countryCode ||
      account.dashboard !== "full"
    ) {
      throw new ServiceUnavailableException(
        "School statement name is unavailable",
      );
    }
    const manage = await this.permissions.resolve({
      ...actor,
      permission: "finance.payments.manage",
      now: new Date(),
    });
    const mode = await this.access.resolveMode(actor);
    if (mode === "LOCKED")
      throw new ForbiddenException("Finance settings access unavailable");
    return {
      status: "CONNECTED",
      schoolName: profile.legalEntityName,
      accountReference: account.id,
      descriptor: account.descriptor,
      checkedAt: new Date().toISOString(),
      livemode: account.livemode,
      canPrepare: mode === "ACTIVE" && manage.allowed,
    };
  }

  private async assertRead(actor: FinanceRequestActor): Promise<void> {
    await this.access.assertStaffAction(actor, "READ_RECORDS");
    const read = await this.permissions.resolve({
      ...actor,
      permission: "finance.payments.read",
      now: new Date(),
    });
    if (!read.allowed)
      throw new ForbiddenException("Finance settings access unavailable");
  }

  private findConnection(actor: FinanceRequestActor) {
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      const profile = await tx.financeProfile.findUnique({
        where: {
          tenantId_orgId: { tenantId: actor.tenantId, orgId: actor.orgId },
        },
        select: { id: true, legalEntityName: true, countryCode: true },
      });
      const connection = profile
        ? await tx.financeStripeConnection.findFirst({
            where: {
              financeProfileId: profile.id,
              tenantId: actor.tenantId,
              orgId: actor.orgId,
            },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            select: {
              id: true,
              stripeAccountId: true,
              status: true,
              livemode: true,
            },
          })
        : null;
      return { profile, connection };
    });
  }
}
