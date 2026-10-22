import {
  Controller,
  Get,
  Header,
  Inject,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from "@nestjs/common";
import { PathwayRequestContext } from "@pathway/auth";
import { PermissionGuard } from "../access-control/permission.guard";
import { AuthUserGuard } from "../auth/auth-user.guard";
import { FinanceAccessGuard } from "./access/finance-access.guard";
import { RequireFinanceAccess } from "./access/finance-access.decorator";
import { financeFamilyInvoiceListQuerySchema } from "./dto/finance-family.dto";
import {
  financeRequestActor,
  parseFinanceInput,
} from "./finance-controller-support";
import { FinanceFamilyService } from "./finance-family.service";

@Controller("finance")
@UseGuards(AuthUserGuard, FinanceAccessGuard, PermissionGuard)
export class FinanceFamilyController {
  constructor(
    @Inject(FinanceFamilyService)
    private readonly family: FinanceFamilyService,
    @Inject(PathwayRequestContext)
    private readonly requestContext: PathwayRequestContext,
  ) {}

  @Get("family/payer-accounts")
  @Header("Cache-Control", "private, no-store")
  listPayerAccounts() {
    return this.family.listPayerAccounts(
      financeRequestActor(this.requestContext),
    );
  }

  @Get("payer-accounts/:payerAccountId/invoices")
  @Header("Cache-Control", "private, no-store")
  @RequireFinanceAccess({
    kind: "payer",
    accountParam: "payerAccountId",
    action: "READ_ACCOUNT",
    permission: "finance.family_invoices.read",
  })
  listInvoices(
    @Param("payerAccountId", ParseUUIDPipe) payerAccountId: string,
    @Query() query: unknown,
  ) {
    return this.family.listInvoices(
      financeRequestActor(this.requestContext),
      payerAccountId,
      parseFinanceInput(financeFamilyInvoiceListQuerySchema, query),
    );
  }

  @Get("payer-accounts/:payerAccountId/invoices/:invoiceId")
  @Header("Cache-Control", "private, no-store")
  @RequireFinanceAccess({
    kind: "payer",
    accountParam: "payerAccountId",
    action: "READ_ACCOUNT",
    permission: "finance.family_invoices.read",
  })
  getInvoice(
    @Param("payerAccountId", ParseUUIDPipe) payerAccountId: string,
    @Param("invoiceId", ParseUUIDPipe) invoiceId: string,
  ) {
    return this.family.getInvoice(
      financeRequestActor(this.requestContext),
      payerAccountId,
      invoiceId,
    );
  }
}
