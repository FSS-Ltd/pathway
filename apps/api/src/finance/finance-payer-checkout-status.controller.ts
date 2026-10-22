import {
  Controller,
  Get,
  Header,
  Inject,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from "@nestjs/common";
import { PathwayRequestContext } from "@pathway/auth";
import { PermissionGuard } from "../access-control/permission.guard";
import { RequirePermission } from "../access-control/require-permission.decorator";
import { AuthUserGuard } from "../auth/auth-user.guard";
import { financeRequestActor } from "./finance-controller-support";
import { FinanceStripeCheckoutAttemptService } from "./stripe/finance-stripe-checkout-attempt.service";

@Controller("finance/payer-checkout-attempts")
@UseGuards(AuthUserGuard, PermissionGuard)
export class FinancePayerCheckoutStatusController {
  constructor(
    @Inject(FinanceStripeCheckoutAttemptService)
    private readonly attempts: FinanceStripeCheckoutAttemptService,
    @Inject(PathwayRequestContext)
    private readonly requestContext: PathwayRequestContext,
  ) {}

  @Get(":attemptId")
  @Header("Cache-Control", "private, no-store")
  @RequirePermission("finance.family_invoices.read")
  getStatus(@Param("attemptId", ParseUUIDPipe) attemptId: string) {
    return this.attempts.getPayerStatus(
      financeRequestActor(this.requestContext),
      attemptId,
    );
  }
}
