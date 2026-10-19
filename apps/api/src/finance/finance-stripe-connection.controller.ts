import { Controller, Get, Inject, Post, UseGuards } from "@nestjs/common";
import { PathwayRequestContext } from "@pathway/auth";
import { PermissionGuard } from "../access-control/permission.guard";
import { AuthUserGuard } from "../auth/auth-user.guard";
import { FinanceAccessGuard } from "./access/finance-access.guard";
import { RequireFinanceAccess } from "./access/finance-access.decorator";
import { financeRequestActor } from "./finance-controller-support";
import { FinanceStripeConnectionService } from "./stripe/finance-stripe-connection.service";

@Controller("finance/stripe-connection")
@UseGuards(AuthUserGuard, FinanceAccessGuard, PermissionGuard)
export class FinanceStripeConnectionController {
  constructor(
    @Inject(FinanceStripeConnectionService)
    private readonly connections: FinanceStripeConnectionService,
    @Inject(PathwayRequestContext)
    private readonly requestContext: PathwayRequestContext,
  ) {}

  @Get()
  @RequireFinanceAccess({
    kind: "staff",
    action: "READ_RECORDS",
    permission: "finance.payments.read",
  })
  getStatus() {
    return this.connections.getStatus(financeRequestActor(this.requestContext));
  }

  @Post("onboarding-link")
  @RequireFinanceAccess({
    kind: "staff",
    action: "MANAGE_COLLECTION_ACCOUNT",
    permission: "finance.payments.manage",
  })
  createOnboardingLink() {
    return this.connections.createOnboardingLink(
      financeRequestActor(this.requestContext),
    );
  }

  @Post("refresh")
  @RequireFinanceAccess({
    kind: "staff",
    action: "MANAGE_COLLECTION_ACCOUNT",
    permission: "finance.payments.manage",
  })
  refresh() {
    return this.connections.refresh(financeRequestActor(this.requestContext));
  }

  @Post("disconnect")
  @RequireFinanceAccess({
    kind: "staff",
    action: "MANAGE_COLLECTION_ACCOUNT",
    permission: "finance.payments.manage",
  })
  disconnect() {
    return this.connections.disconnect(
      financeRequestActor(this.requestContext),
    );
  }
}
