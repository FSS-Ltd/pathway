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
  financeManualRefundConfirmationSchema,
  financeManualRefundReturnRequestSchema,
  financeRefundDecisionSchema,
  financeRefundListQuerySchema,
  financeRefundRequestSchema,
} from "./dto/finance-refund.dto";
import { FinanceManualRefundReturnService } from "./finance-manual-refund-return.service";
import { FinanceRefundService } from "./finance-refund.service";

@Controller("finance")
@UseGuards(AuthUserGuard, FinanceAccessGuard, PermissionGuard)
export class FinanceRefundController {
  constructor(
    @Inject(FinanceRefundService)
    private readonly refunds: FinanceRefundService,
    @Inject(FinanceManualRefundReturnService)
    private readonly manualRefundReturns: FinanceManualRefundReturnService,
    @Inject(PathwayRequestContext)
    private readonly requestContext: PathwayRequestContext,
  ) {}

  @Get("refunds")
  @RequireFinanceAccess({
    kind: "staff",
    action: "READ_RECORDS",
    permission: "finance.invoices.read",
  })
  list(@Query() query: unknown) {
    return this.refunds.list(
      financeRequestActor(this.requestContext),
      parseFinanceInput(financeRefundListQuerySchema, query),
    );
  }

  @Get("refunds/:refundId")
  @RequireFinanceAccess({
    kind: "staff",
    action: "READ_RECORDS",
    permission: "finance.invoices.read",
  })
  get(@Param("refundId", ParseUUIDPipe) refundId: string) {
    return this.refunds.get(financeRequestActor(this.requestContext), refundId);
  }

  @Post("receipts/:receiptId/refunds")
  @RequireFinanceAccess({
    kind: "staff",
    action: "REFUND",
    permission: "finance.payments.manage",
  })
  request(
    @Param("receiptId", ParseUUIDPipe) receiptId: string,
    @Body() body: unknown,
    @Headers("idempotency-key") key: string | undefined,
  ) {
    return this.refunds.request(
      financeRequestActor(this.requestContext),
      receiptId,
      financeIdempotencyKey(key),
      parseFinanceInput(financeRefundRequestSchema, body),
    );
  }

  @Post("refunds/:refundId/approve")
  @RequireFinanceAccess({
    kind: "staff",
    action: "REFUND",
    permission: "finance.approvals.review",
  })
  approve(
    @Param("refundId", ParseUUIDPipe) refundId: string,
    @Body() body: unknown,
    @Headers("idempotency-key") key: string | undefined,
  ) {
    return this.refunds.approve(
      financeRequestActor(this.requestContext),
      refundId,
      financeIdempotencyKey(key),
      parseFinanceInput(financeRefundDecisionSchema, body),
    );
  }

  @Post("refunds/:refundId/reject")
  @RequireFinanceAccess({
    kind: "staff",
    action: "REFUND",
    permission: "finance.approvals.review",
  })
  reject(
    @Param("refundId", ParseUUIDPipe) refundId: string,
    @Body() body: unknown,
    @Headers("idempotency-key") key: string | undefined,
  ) {
    return this.refunds.reject(
      financeRequestActor(this.requestContext),
      refundId,
      financeIdempotencyKey(key),
      parseFinanceInput(financeRefundDecisionSchema, body),
    );
  }

  @Post("refunds/:refundId/confirm-manual")
  @RequireFinanceAccess({
    kind: "staff",
    action: "REFUND",
    permission: "finance.payments.manage",
  })
  confirmManual(
    @Param("refundId", ParseUUIDPipe) refundId: string,
    @Body() body: unknown,
    @Headers("idempotency-key") key: string | undefined,
  ) {
    return this.refunds.confirmManualRefund(
      financeRequestActor(this.requestContext),
      refundId,
      financeIdempotencyKey(key),
      parseFinanceInput(financeManualRefundConfirmationSchema, body),
    );
  }

  @Post("refunds/:refundId/manual-return-requests")
  @RequireFinanceAccess({
    kind: "staff",
    action: "REFUND",
    permission: "finance.payments.manage",
  })
  requestManualReturn(
    @Param("refundId", ParseUUIDPipe) refundId: string,
    @Body() body: unknown,
    @Headers("idempotency-key") key: string | undefined,
  ) {
    return this.manualRefundReturns.requestManualReturn(
      financeRequestActor(this.requestContext),
      refundId,
      financeIdempotencyKey(key),
      parseFinanceInput(financeManualRefundReturnRequestSchema, body),
    );
  }

  @Post("refunds/:refundId/manual-return-requests/approve")
  @RequireFinanceAccess({
    kind: "staff",
    action: "REFUND",
    permission: "finance.approvals.review",
  })
  approveManualReturn(
    @Param("refundId", ParseUUIDPipe) refundId: string,
    @Body() body: unknown,
    @Headers("idempotency-key") key: string | undefined,
  ) {
    return this.manualRefundReturns.approveManualReturn(
      financeRequestActor(this.requestContext),
      refundId,
      financeIdempotencyKey(key),
      parseFinanceInput(financeRefundDecisionSchema, body),
    );
  }

  @Post("refunds/:refundId/manual-return-requests/reject")
  @RequireFinanceAccess({
    kind: "staff",
    action: "REFUND",
    permission: "finance.approvals.review",
  })
  rejectManualReturn(
    @Param("refundId", ParseUUIDPipe) refundId: string,
    @Body() body: unknown,
    @Headers("idempotency-key") key: string | undefined,
  ) {
    return this.manualRefundReturns.rejectManualReturn(
      financeRequestActor(this.requestContext),
      refundId,
      financeIdempotencyKey(key),
      parseFinanceInput(financeRefundDecisionSchema, body),
    );
  }
}
