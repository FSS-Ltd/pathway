import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  Inject,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { PathwayRequestContext } from "@pathway/auth";
import { PermissionGuard } from "../access-control/permission.guard";
import { AuthUserGuard } from "../auth/auth-user.guard";
import { FinanceAccessGuard } from "./access/finance-access.guard";
import { RequireFinanceAccess } from "./access/finance-access.decorator";
import {
  financeIdempotencyKey,
  financeRequestActor,
  parseFinanceInput,
} from "./finance-controller-support";
import {
  financePayerAccountCreateSchema,
  financePayerAccountListQuerySchema,
} from "./dto/finance-payer-account.dto";
import { FinancePayerAccountService } from "./finance-payer-account.service";

@Controller("finance/payer-accounts")
@UseGuards(AuthUserGuard, FinanceAccessGuard, PermissionGuard)
export class FinancePayerAccountController {
  constructor(
    @Inject(FinancePayerAccountService)
    private readonly payerAccounts: FinancePayerAccountService,
    @Inject(PathwayRequestContext)
    private readonly requestContext: PathwayRequestContext,
  ) {}

  @Get()
  @Header("Cache-Control", "private, no-store")
  @RequireFinanceAccess({
    kind: "staff",
    action: "READ_RECORDS",
    permission: "finance.invoices.read",
  })
  list(@Query() query: unknown) {
    return this.payerAccounts.list(
      financeRequestActor(this.requestContext),
      parseFinanceInput(financePayerAccountListQuerySchema, query),
    );
  }

  @Post()
  @RequireFinanceAccess({
    kind: "staff",
    action: "CREATE_INVOICE",
    permission: "finance.invoices.manage",
  })
  create(
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
  ) {
    return this.payerAccounts.create(
      financeRequestActor(this.requestContext),
      financeIdempotencyKey(key),
      parseFinanceInput(financePayerAccountCreateSchema, body),
    );
  }
}
