import { Controller, Get, Header, Inject, UseGuards } from "@nestjs/common";
import { PathwayRequestContext } from "@pathway/auth";
import { PermissionGuard } from "../access-control/permission.guard";
import { AuthUserGuard } from "../auth/auth-user.guard";
import { FinanceAccessGuard } from "./access/finance-access.guard";
import { RequireFinanceAccess } from "./access/finance-access.decorator";
import { financeRequestActor } from "./finance-controller-support";
import { FinanceStatementNameService } from "./stripe/finance-statement-name.service";

@Controller("finance/stripe-connection/statement-name")
@UseGuards(AuthUserGuard, FinanceAccessGuard, PermissionGuard)
export class FinanceStatementNameController {
  constructor(
    @Inject(FinanceStatementNameService)
    private readonly names: FinanceStatementNameService,
    @Inject(PathwayRequestContext)
    private readonly context: PathwayRequestContext,
  ) {}

  @Get()
  @Header("Cache-Control", "private, no-store")
  @RequireFinanceAccess({
    kind: "staff",
    action: "READ_RECORDS",
    permission: "finance.payments.read",
  })
  get() {
    return this.names.get(financeRequestActor(this.context));
  }
}
