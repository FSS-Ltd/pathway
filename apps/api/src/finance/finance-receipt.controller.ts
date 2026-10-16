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
  financeReceiptAllocationSchema,
  financeReceiptListQuerySchema,
  financeReceiptReversalSchema,
} from "./dto/finance-receipt.dto";
import { FinanceReceiptService } from "./finance-receipt.service";

@Controller("finance")
@UseGuards(AuthUserGuard, FinanceAccessGuard, PermissionGuard)
export class FinanceReceiptController {
  constructor(
    @Inject(FinanceReceiptService)
    private readonly receipts: FinanceReceiptService,
    @Inject(PathwayRequestContext)
    private readonly requestContext: PathwayRequestContext,
  ) {}

  @Get("receipts")
  @RequireFinanceAccess({
    kind: "staff",
    action: "READ_RECORDS",
    permission: "finance.invoices.read",
  })
  list(@Query() query: unknown) {
    return this.receipts.list(
      financeRequestActor(this.requestContext),
      parseFinanceInput(financeReceiptListQuerySchema, query),
    );
  }

  @Get("receipts/:receiptId")
  @RequireFinanceAccess({
    kind: "staff",
    action: "READ_RECORDS",
    permission: "finance.invoices.read",
  })
  get(@Param("receiptId", ParseUUIDPipe) receiptId: string) {
    return this.receipts.get(
      financeRequestActor(this.requestContext),
      receiptId,
    );
  }

  @Post("receipts/:receiptId/allocations")
  @RequireFinanceAccess({
    kind: "staff",
    action: "ALLOCATE_RECEIPT",
    permission: "finance.invoices.manage",
  })
  allocate(
    @Param("receiptId", ParseUUIDPipe) receiptId: string,
    @Body() body: unknown,
    @Headers("idempotency-key") key: string | undefined,
  ) {
    return this.receipts.allocate(
      financeRequestActor(this.requestContext),
      receiptId,
      financeIdempotencyKey(key),
      parseFinanceInput(financeReceiptAllocationSchema, body),
    );
  }

  @Post("allocations/:allocationId/reversals")
  @RequireFinanceAccess({
    kind: "staff",
    action: "REVERSE_RECEIPT",
    permission: "finance.invoices.manage",
  })
  reverseAllocation(
    @Param("allocationId", ParseUUIDPipe) allocationId: string,
    @Body() body: unknown,
    @Headers("idempotency-key") key: string | undefined,
  ) {
    return this.receipts.reverseAllocation(
      financeRequestActor(this.requestContext),
      allocationId,
      financeIdempotencyKey(key),
      parseFinanceInput(financeReceiptReversalSchema, body),
    );
  }
}
