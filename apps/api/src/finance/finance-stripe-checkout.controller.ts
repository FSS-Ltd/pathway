import {
  Controller,
  Header,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from "@nestjs/common";
import { PathwayRequestContext } from "@pathway/auth";
import { PermissionGuard } from "../access-control/permission.guard";
import { AuthUserGuard } from "../auth/auth-user.guard";
import { FinanceAccessGuard } from "./access/finance-access.guard";
import { RequireFinanceAccess } from "./access/finance-access.decorator";
import { financeRequestActor } from "./finance-controller-support";
import { FinanceStripeCheckoutService } from "./stripe/finance-stripe-checkout.service";

@Controller("finance/payer-accounts/:payerAccountId/invoices/:invoiceId")
@UseGuards(AuthUserGuard, FinanceAccessGuard, PermissionGuard)
export class FinanceStripeCheckoutController {
  constructor(
    @Inject(FinanceStripeCheckoutService)
    private readonly checkout: FinanceStripeCheckoutService,
    @Inject(PathwayRequestContext)
    private readonly requestContext: PathwayRequestContext,
  ) {}

  @Post("checkout")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "private, no-store")
  @RequireFinanceAccess({
    kind: "payer",
    accountParam: "payerAccountId",
    action: "SETTLE_ISSUED_INVOICE",
    permission: "finance.family_payments.pay",
  })
  startCheckout(
    @Param("payerAccountId", ParseUUIDPipe) payerAccountId: string,
    @Param("invoiceId", ParseUUIDPipe) invoiceId: string,
  ) {
    return this.checkout.startCheckout(
      financeRequestActor(this.requestContext),
      payerAccountId,
      invoiceId,
    );
  }
}
