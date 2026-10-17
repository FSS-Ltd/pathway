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
  financeManualReceiptDecisionSchema,
  financeManualReceiptRequestListQuerySchema,
  financeManualReceiptRequestSchema,
  financeTransferNoticeListQuerySchema,
  financeTransferNoticeSchema,
} from "./dto/finance-manual-receipt.dto";
import { FinanceManualReceiptService } from "./finance-manual-receipt.service";

@Controller("finance")
@UseGuards(AuthUserGuard, FinanceAccessGuard, PermissionGuard)
export class FinanceManualReceiptController {
  constructor(
    @Inject(FinanceManualReceiptService)
    private readonly manualReceipts: FinanceManualReceiptService,
    @Inject(PathwayRequestContext)
    private readonly requestContext: PathwayRequestContext,
  ) {}

  @Get("manual-receipt-requests")
  @RequireFinanceAccess({
    kind: "staff",
    action: "READ_RECORDS",
    permission: "finance.payments.read",
  })
  listRequests(@Query() query: unknown) {
    return this.manualReceipts.listRequests(
      financeRequestActor(this.requestContext),
      parseFinanceInput(financeManualReceiptRequestListQuerySchema, query),
    );
  }

  @Post("manual-receipt-requests")
  @RequireFinanceAccess({
    kind: "staff",
    action: "RECORD_IN_FLIGHT_PAYMENT",
    permission: "finance.payments.manage",
  })
  createRequest(
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
  ) {
    return this.manualReceipts.createRequest(
      financeRequestActor(this.requestContext),
      financeIdempotencyKey(idempotencyKey),
      parseFinanceInput(financeManualReceiptRequestSchema, body),
    );
  }

  @Post("manual-receipt-requests/:requestId/approve")
  @RequireFinanceAccess({
    kind: "staff",
    action: "RECORD_IN_FLIGHT_PAYMENT",
    permission: "finance.approvals.review",
  })
  approveRequest(
    @Param("requestId", ParseUUIDPipe) requestId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
  ) {
    return this.manualReceipts.approveRequest(
      financeRequestActor(this.requestContext),
      requestId,
      financeIdempotencyKey(idempotencyKey),
    );
  }

  @Post("manual-receipt-requests/:requestId/reject")
  @RequireFinanceAccess({
    kind: "staff",
    action: "RECORD_IN_FLIGHT_PAYMENT",
    permission: "finance.approvals.review",
  })
  rejectRequest(
    @Param("requestId", ParseUUIDPipe) requestId: string,
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
  ) {
    return this.manualReceipts.rejectRequest(
      financeRequestActor(this.requestContext),
      requestId,
      financeIdempotencyKey(idempotencyKey),
      parseFinanceInput(financeManualReceiptDecisionSchema, body),
    );
  }

  @Get("transfer-notices")
  @RequireFinanceAccess({
    kind: "staff",
    action: "READ_RECORDS",
    permission: "finance.payments.read",
  })
  listTransferNotices(@Query() query: unknown) {
    return this.manualReceipts.listTransferNotices(
      financeRequestActor(this.requestContext),
      parseFinanceInput(financeTransferNoticeListQuerySchema, query),
    );
  }

  @Post("payer-accounts/:payerAccountId/invoices/:invoiceId/transfer-notices")
  @RequireFinanceAccess({
    kind: "payer",
    accountParam: "payerAccountId",
    action: "DECLARE_TRANSFER",
    permission: "finance.family_payments.pay",
  })
  submitTransferNotice(
    @Param("payerAccountId", ParseUUIDPipe) payerAccountId: string,
    @Param("invoiceId", ParseUUIDPipe) invoiceId: string,
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
  ) {
    return this.manualReceipts.submitTransferNotice(
      financeRequestActor(this.requestContext),
      payerAccountId,
      invoiceId,
      financeIdempotencyKey(idempotencyKey),
      parseFinanceInput(financeTransferNoticeSchema, body),
    );
  }
}
