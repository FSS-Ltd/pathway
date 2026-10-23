import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
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
import { FinanceInvoiceService } from "./finance-invoice.service";
import {
  financeInvoiceDraftSchema,
  financeInvoiceIdSchema,
  financeInvoiceTransitionSchema,
  financeInvoiceListQuerySchema,
  financeRequestChangesSchema,
  financeVoidInvoiceSchema,
} from "./dto/finance-invoice.dto";

@Controller("finance/invoices")
@UseGuards(AuthUserGuard, FinanceAccessGuard, PermissionGuard)
export class FinanceInvoiceController {
  constructor(
    @Inject(FinanceInvoiceService)
    private readonly invoices: FinanceInvoiceService,
    @Inject(PathwayRequestContext)
    private readonly requestContext: PathwayRequestContext,
  ) {}

  @Get()
  @RequireFinanceAccess({
    kind: "staff",
    action: "READ_RECORDS",
    permission: "finance.invoices.read",
  })
  list(@Query() query: unknown) {
    return this.invoices.list(
      financeRequestActor(this.requestContext),
      parseFinanceInput(financeInvoiceListQuerySchema, query),
    );
  }

  @Get(":invoiceId")
  @RequireFinanceAccess({
    kind: "staff",
    action: "READ_RECORDS",
    permission: "finance.invoices.read",
  })
  get(@Param("invoiceId", ParseUUIDPipe) invoiceId: string) {
    parseFinanceInput(financeInvoiceIdSchema, invoiceId);
    return this.invoices.get(
      financeRequestActor(this.requestContext),
      invoiceId,
    );
  }

  @Post()
  @RequireFinanceAccess({
    kind: "staff",
    action: "CREATE_INVOICE",
    permission: "finance.invoices.manage",
  })
  create(
    @Body() body: unknown,
    @Headers("idempotency-key") key: string | undefined,
  ) {
    return this.invoices.createDraft(
      financeRequestActor(this.requestContext),
      financeIdempotencyKey(key),
      parseFinanceInput(financeInvoiceDraftSchema, body),
    );
  }

  @Patch(":invoiceId")
  @RequireFinanceAccess({
    kind: "staff",
    action: "UPDATE_INVOICE",
    permission: "finance.invoices.manage",
  })
  update(
    @Param("invoiceId", ParseUUIDPipe) invoiceId: string,
    @Body() body: unknown,
    @Headers("idempotency-key") key: string | undefined,
  ) {
    return this.invoices.updateDraft(
      financeRequestActor(this.requestContext),
      invoiceId,
      financeIdempotencyKey(key),
      parseFinanceInput(financeInvoiceDraftSchema, body),
    );
  }

  @Post(":invoiceId/submit-review")
  @RequireFinanceAccess({
    kind: "staff",
    action: "SUBMIT_INVOICE_FOR_REVIEW",
    permission: "finance.invoices.manage",
  })
  submitForReview(
    @Param("invoiceId", ParseUUIDPipe) invoiceId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
  ) {
    return this.invoices.submitForReview(
      financeRequestActor(this.requestContext),
      invoiceId,
      financeIdempotencyKey(key),
      parseFinanceInput(financeInvoiceTransitionSchema, body).expectedRevision,
    );
  }

  @Post(":invoiceId/approve")
  @RequireFinanceAccess({
    kind: "staff",
    action: "REVIEW_INVOICE",
    permission: "finance.approvals.review",
  })
  approve(
    @Param("invoiceId", ParseUUIDPipe) invoiceId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
  ) {
    return this.invoices.approve(
      financeRequestActor(this.requestContext),
      invoiceId,
      financeIdempotencyKey(key),
      parseFinanceInput(financeInvoiceTransitionSchema, body).expectedRevision,
    );
  }

  @Post(":invoiceId/request-changes")
  @RequireFinanceAccess({
    kind: "staff",
    action: "REVIEW_INVOICE",
    permission: "finance.approvals.review",
  })
  requestChanges(
    @Param("invoiceId", ParseUUIDPipe) invoiceId: string,
    @Body() body: unknown,
    @Headers("idempotency-key") key: string | undefined,
  ) {
    return this.invoices.requestChanges(
      financeRequestActor(this.requestContext),
      invoiceId,
      financeIdempotencyKey(key),
      parseFinanceInput(financeRequestChangesSchema, body),
    );
  }

  @Post(":invoiceId/issue")
  @RequireFinanceAccess({
    kind: "staff",
    action: "ISSUE_INVOICE",
    permission: "finance.invoices.manage",
  })
  issue(
    @Param("invoiceId", ParseUUIDPipe) invoiceId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
  ) {
    return this.invoices.issue(
      financeRequestActor(this.requestContext),
      invoiceId,
      financeIdempotencyKey(key),
      parseFinanceInput(financeInvoiceTransitionSchema, body).expectedRevision,
    );
  }

  @Post(":invoiceId/void")
  @RequireFinanceAccess({
    kind: "staff",
    action: "VOID_INVOICE",
    permission: "finance.invoices.manage",
  })
  void(
    @Param("invoiceId", ParseUUIDPipe) invoiceId: string,
    @Body() body: unknown,
    @Headers("idempotency-key") key: string | undefined,
  ) {
    return this.invoices.void(
      financeRequestActor(this.requestContext),
      invoiceId,
      financeIdempotencyKey(key),
      parseFinanceInput(financeVoidInvoiceSchema, body),
    );
  }
}
