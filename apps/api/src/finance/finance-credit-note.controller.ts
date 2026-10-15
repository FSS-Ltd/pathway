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
import { FinanceCreditNoteService } from "./finance-credit-note.service";
import {
  financeCreditNoteDraftSchema,
  financeCreditNoteIdSchema,
  financeCreditNoteListQuerySchema,
  financeCreditNoteVoidSchema,
} from "./dto/finance-credit-note.dto";
import { financeRequestChangesSchema } from "./dto/finance-invoice.dto";

@Controller("finance")
@UseGuards(AuthUserGuard, FinanceAccessGuard, PermissionGuard)
export class FinanceCreditNoteController {
  constructor(
    @Inject(FinanceCreditNoteService)
    private readonly creditNotes: FinanceCreditNoteService,
    @Inject(PathwayRequestContext)
    private readonly requestContext: PathwayRequestContext,
  ) {}

  @Get("credit-notes")
  @RequireFinanceAccess({
    kind: "staff",
    action: "READ_RECORDS",
    permission: "finance.invoices.read",
  })
  list(@Query() query: unknown) {
    return this.creditNotes.list(
      financeRequestActor(this.requestContext),
      parseFinanceInput(financeCreditNoteListQuerySchema, query),
    );
  }

  @Get("credit-notes/:creditNoteId")
  @RequireFinanceAccess({
    kind: "staff",
    action: "READ_RECORDS",
    permission: "finance.invoices.read",
  })
  get(@Param("creditNoteId", ParseUUIDPipe) creditNoteId: string) {
    parseFinanceInput(financeCreditNoteIdSchema, creditNoteId);
    return this.creditNotes.get(
      financeRequestActor(this.requestContext),
      creditNoteId,
    );
  }

  @Post("invoices/:invoiceId/credits")
  @RequireFinanceAccess({
    kind: "staff",
    action: "CREATE_CREDIT",
    permission: "finance.invoices.manage",
  })
  create(
    @Param("invoiceId", ParseUUIDPipe) invoiceId: string,
    @Body() body: unknown,
    @Headers("idempotency-key") key: string | undefined,
  ) {
    return this.creditNotes.createDraft(
      financeRequestActor(this.requestContext),
      invoiceId,
      financeIdempotencyKey(key),
      parseFinanceInput(financeCreditNoteDraftSchema, body),
    );
  }

  @Patch("credit-notes/:creditNoteId")
  @RequireFinanceAccess({
    kind: "staff",
    action: "UPDATE_CREDIT",
    permission: "finance.invoices.manage",
  })
  update(
    @Param("creditNoteId", ParseUUIDPipe) creditNoteId: string,
    @Body() body: unknown,
    @Headers("idempotency-key") key: string | undefined,
  ) {
    return this.creditNotes.updateDraft(
      financeRequestActor(this.requestContext),
      creditNoteId,
      financeIdempotencyKey(key),
      parseFinanceInput(financeCreditNoteDraftSchema, body),
    );
  }

  @Post("credit-notes/:creditNoteId/submit-review")
  @RequireFinanceAccess({
    kind: "staff",
    action: "SUBMIT_CREDIT_FOR_REVIEW",
    permission: "finance.invoices.manage",
  })
  submitForReview(
    @Param("creditNoteId", ParseUUIDPipe) creditNoteId: string,
    @Headers("idempotency-key") key: string | undefined,
  ) {
    return this.creditNotes.submitForReview(
      financeRequestActor(this.requestContext),
      creditNoteId,
      financeIdempotencyKey(key),
    );
  }

  @Post("credit-notes/:creditNoteId/approve")
  @RequireFinanceAccess({
    kind: "staff",
    action: "REVIEW_INVOICE",
    permission: "finance.approvals.review",
  })
  approve(
    @Param("creditNoteId", ParseUUIDPipe) creditNoteId: string,
    @Headers("idempotency-key") key: string | undefined,
  ) {
    return this.creditNotes.approve(
      financeRequestActor(this.requestContext),
      creditNoteId,
      financeIdempotencyKey(key),
    );
  }

  @Post("credit-notes/:creditNoteId/request-changes")
  @RequireFinanceAccess({
    kind: "staff",
    action: "REVIEW_INVOICE",
    permission: "finance.approvals.review",
  })
  requestChanges(
    @Param("creditNoteId", ParseUUIDPipe) creditNoteId: string,
    @Body() body: unknown,
    @Headers("idempotency-key") key: string | undefined,
  ) {
    return this.creditNotes.requestChanges(
      financeRequestActor(this.requestContext),
      creditNoteId,
      financeIdempotencyKey(key),
      parseFinanceInput(financeRequestChangesSchema, body),
    );
  }

  @Post("credit-notes/:creditNoteId/issue")
  @RequireFinanceAccess({
    kind: "staff",
    action: "ISSUE_CREDIT",
    permission: "finance.invoices.manage",
  })
  issue(
    @Param("creditNoteId", ParseUUIDPipe) creditNoteId: string,
    @Headers("idempotency-key") key: string | undefined,
  ) {
    return this.creditNotes.issue(
      financeRequestActor(this.requestContext),
      creditNoteId,
      financeIdempotencyKey(key),
    );
  }

  @Post("credit-notes/:creditNoteId/void")
  @RequireFinanceAccess({
    kind: "staff",
    action: "VOID_CREDIT",
    permission: "finance.invoices.manage",
  })
  void(
    @Param("creditNoteId", ParseUUIDPipe) creditNoteId: string,
    @Body() body: unknown,
    @Headers("idempotency-key") key: string | undefined,
  ) {
    return this.creditNotes.void(
      financeRequestActor(this.requestContext),
      creditNoteId,
      financeIdempotencyKey(key),
      parseFinanceInput(financeCreditNoteVoidSchema, body),
    );
  }
}
