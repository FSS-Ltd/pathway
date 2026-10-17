import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  ParseUUIDPipe,
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
  financeBankTransferChangeListQuerySchema,
  financeBankTransferChangeSchema,
  financeBankTransferDecisionSchema,
} from "./dto/finance-bank-transfer.dto";
import { FinanceBankTransferService } from "./finance-bank-transfer.service";

@Controller("finance")
@UseGuards(AuthUserGuard, FinanceAccessGuard, PermissionGuard)
export class FinanceBankTransferController {
  constructor(
    @Inject(FinanceBankTransferService)
    private readonly bankTransfers: FinanceBankTransferService,
    @Inject(PathwayRequestContext)
    private readonly requestContext: PathwayRequestContext,
  ) {}

  @Get("bank-transfer-changes")
  @RequireFinanceAccess({
    kind: "staff",
    action: "READ_RECORDS",
    permission: "finance.payments.read",
  })
  listChanges(@Query() query: unknown) {
    return this.bankTransfers.listChanges(
      financeRequestActor(this.requestContext),
      parseFinanceInput(financeBankTransferChangeListQuerySchema, query),
    );
  }

  @Post("bank-transfer-changes")
  @RequireFinanceAccess({
    kind: "staff",
    action: "MANAGE_BANK_TRANSFER_DETAILS",
    permission: "finance.payments.manage",
  })
  requestChange(
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
  ) {
    return this.bankTransfers.requestChange(
      financeRequestActor(this.requestContext),
      financeIdempotencyKey(idempotencyKey),
      parseFinanceInput(financeBankTransferChangeSchema, body),
    );
  }

  @Post("bank-transfer-changes/:changeId/approve")
  @RequireFinanceAccess({
    kind: "staff",
    action: "MANAGE_BANK_TRANSFER_DETAILS",
    permission: "finance.approvals.review",
  })
  approveChange(
    @Param("changeId", ParseUUIDPipe) changeId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
  ) {
    return this.bankTransfers.approveChange(
      financeRequestActor(this.requestContext),
      changeId,
      financeIdempotencyKey(idempotencyKey),
    );
  }

  @Post("bank-transfer-changes/:changeId/reject")
  @RequireFinanceAccess({
    kind: "staff",
    action: "MANAGE_BANK_TRANSFER_DETAILS",
    permission: "finance.approvals.review",
  })
  rejectChange(
    @Param("changeId", ParseUUIDPipe) changeId: string,
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
  ) {
    return this.bankTransfers.rejectChange(
      financeRequestActor(this.requestContext),
      changeId,
      financeIdempotencyKey(idempotencyKey),
      parseFinanceInput(financeBankTransferDecisionSchema, body),
    );
  }

  @Get("payer-accounts/:payerAccountId/invoices/:invoiceId/bank-transfer")
  @RequireFinanceAccess({
    kind: "payer",
    accountParam: "payerAccountId",
    action: "SETTLE_ISSUED_INVOICE",
    permission: "finance.family_payments.pay",
  })
  forPayerInvoice(
    @Param("payerAccountId", ParseUUIDPipe) payerAccountId: string,
    @Param("invoiceId", ParseUUIDPipe) invoiceId: string,
  ) {
    return this.bankTransfers.forPayerInvoice(
      financeRequestActor(this.requestContext),
      payerAccountId,
      invoiceId,
    );
  }
}
