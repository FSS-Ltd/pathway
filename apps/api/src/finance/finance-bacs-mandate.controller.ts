import {
  Controller,
  Delete,
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
import { FinanceStripeBacsMandateService } from "./stripe/finance-stripe-bacs-mandate.service";

@Controller("finance/payer-accounts/:payerAccountId/bacs/mandates")
@UseGuards(AuthUserGuard, FinanceAccessGuard, PermissionGuard)
export class FinanceBacsMandateController {
  constructor(
    @Inject(FinanceStripeBacsMandateService)
    private readonly mandates: FinanceStripeBacsMandateService,
    @Inject(PathwayRequestContext)
    private readonly requestContext: PathwayRequestContext,
  ) {}

  @Post("setup")
  @Header("Cache-Control", "private, no-store")
  @RequireFinanceAccess({
    kind: "payer",
    accountParam: "payerAccountId",
    action: "SETUP_MANDATE",
    permission: "finance.family_payments.pay",
  })
  setup(@Param("payerAccountId", ParseUUIDPipe) payerAccountId: string) {
    return this.mandates.startSetup(
      financeRequestActor(this.requestContext),
      payerAccountId,
    );
  }

  @Delete(":mandateId")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "private, no-store")
  @RequireFinanceAccess({
    kind: "payer",
    accountParam: "payerAccountId",
    action: "CANCEL_MANDATE",
    permission: "finance.family_payments.pay",
  })
  cancel(
    @Param("payerAccountId", ParseUUIDPipe) payerAccountId: string,
    @Param("mandateId", ParseUUIDPipe) mandateId: string,
  ) {
    return this.mandates.cancel(
      financeRequestActor(this.requestContext),
      payerAccountId,
      mandateId,
    );
  }
}
