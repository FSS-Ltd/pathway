import {
  Body,
  Controller,
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
import {
  financeRequestActor,
  parseFinanceInput,
} from "./finance-controller-support";
import { FinanceCollectionPlanService } from "./finance-collection-plan.service";
import { financeCollectionPlanDraftSchema } from "./dto/finance-collection-plan.dto";

@Controller()
@UseGuards(AuthUserGuard, FinanceAccessGuard, PermissionGuard)
export class FinanceCollectionPlanController {
  constructor(
    @Inject(FinanceCollectionPlanService)
    private readonly collectionPlans: FinanceCollectionPlanService,
    @Inject(PathwayRequestContext)
    private readonly requestContext: PathwayRequestContext,
  ) {}

  @Post("finance/invoices/:invoiceId/collection-plans")
  @HttpCode(HttpStatus.CREATED)
  @RequireFinanceAccess({
    kind: "staff",
    action: "SCHEDULE_DEBIT",
    permission: "finance.payments.manage",
  })
  create(
    @Param("invoiceId", ParseUUIDPipe) invoiceId: string,
    @Body() body: unknown,
  ) {
    return this.collectionPlans.create(
      financeRequestActor(this.requestContext),
      invoiceId,
      parseFinanceInput(financeCollectionPlanDraftSchema, body),
    );
  }

  @Post("finance/collection-plans/:planId/approve")
  @HttpCode(HttpStatus.OK)
  @RequireFinanceAccess({
    kind: "staff",
    action: "APPROVE_AUTOMATED_DEBIT",
    permission: "finance.approvals.review",
  })
  approve(@Param("planId", ParseUUIDPipe) planId: string) {
    return this.collectionPlans.approve(
      financeRequestActor(this.requestContext),
      planId,
    );
  }

  @Post("finance/collection-plans/:planId/cancel")
  @HttpCode(HttpStatus.OK)
  @RequireFinanceAccess({
    kind: "staff",
    action: "CANCEL_COLLECTION_PLAN",
    permission: "finance.payments.manage",
  })
  cancel(@Param("planId", ParseUUIDPipe) planId: string) {
    return this.collectionPlans.cancelByStaff(
      financeRequestActor(this.requestContext),
      planId,
    );
  }

  @Post("finance/collection-plans/:planId/resume")
  @HttpCode(HttpStatus.OK)
  @RequireFinanceAccess({
    kind: "staff",
    action: "APPROVE_AUTOMATED_DEBIT",
    permission: "finance.approvals.review",
  })
  resume(@Param("planId", ParseUUIDPipe) planId: string) {
    return this.collectionPlans.resumeByStaff(
      financeRequestActor(this.requestContext),
      planId,
    );
  }
}

@Controller("finance/payer-accounts/:payerAccountId/collection-plans")
@UseGuards(AuthUserGuard, FinanceAccessGuard, PermissionGuard)
export class FinancePayerCollectionPlanController {
  constructor(
    @Inject(FinanceCollectionPlanService)
    private readonly collectionPlans: FinanceCollectionPlanService,
    @Inject(PathwayRequestContext)
    private readonly requestContext: PathwayRequestContext,
  ) {}

  @Post(":planId/accept")
  @HttpCode(HttpStatus.OK)
  @RequireFinanceAccess({
    kind: "payer",
    accountParam: "payerAccountId",
    action: "ACCEPT_COLLECTION_PLAN",
    permission: "finance.family_payments.pay",
  })
  accept(
    @Param("payerAccountId", ParseUUIDPipe) payerAccountId: string,
    @Param("planId", ParseUUIDPipe) planId: string,
  ) {
    return this.collectionPlans.accept(
      financeRequestActor(this.requestContext),
      payerAccountId,
      planId,
    );
  }

  @Post(":planId/cancel")
  @HttpCode(HttpStatus.OK)
  @RequireFinanceAccess({
    kind: "payer",
    accountParam: "payerAccountId",
    action: "CANCEL_COLLECTION_PLAN",
    permission: "finance.family_payments.pay",
  })
  cancel(
    @Param("payerAccountId", ParseUUIDPipe) payerAccountId: string,
    @Param("planId", ParseUUIDPipe) planId: string,
  ) {
    return this.collectionPlans.cancelByPayer(
      financeRequestActor(this.requestContext),
      payerAccountId,
      planId,
    );
  }
}
