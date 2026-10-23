import { z } from "zod";
import {
  Body,
  Controller,
  Get,
  Header,
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
  financeRequestActor,
  parseFinanceInput,
} from "./finance-controller-support";
import {
  financeCaseActionSchema,
  financeCaseListSchema,
} from "./dto/finance-reconciliation.dto";
import { FinanceReconciliationService } from "./finance-reconciliation.service";

@Controller("finance/reconciliation/cases")
@UseGuards(AuthUserGuard, FinanceAccessGuard, PermissionGuard)
export class FinanceReconciliationController {
  constructor(
    @Inject(FinanceReconciliationService)
    private readonly cases: FinanceReconciliationService,
    @Inject(PathwayRequestContext)
    private readonly context: PathwayRequestContext,
  ) {}

  @Get()
  @Header("Cache-Control", "private, no-store")
  @RequireFinanceAccess({
    kind: "staff",
    action: "READ_RECORDS",
    permission: "finance.invoices.read",
  })
  list(@Query() query: unknown) {
    return this.cases.list(
      financeRequestActor(this.context),
      parseFinanceInput(financeCaseListSchema, query),
    );
  }

  @Get(":caseId")
  @Header("Cache-Control", "private, no-store")
  @RequireFinanceAccess({
    kind: "staff",
    action: "READ_RECORDS",
    permission: "finance.invoices.read",
  })
  get(@Param("caseId", ParseUUIDPipe) id: string) {
    return this.cases.get(financeRequestActor(this.context), id);
  }

  @Get(":caseId/history")
  @Header("Cache-Control", "private, no-store")
  @RequireFinanceAccess({
    kind: "staff",
    action: "READ_RECORDS",
    permission: "finance.invoices.read",
  })
  history(
    @Param("caseId", ParseUUIDPipe) id: string,
    @Query("cursor") cursor: unknown,
  ) {
    return this.cases.history(
      financeRequestActor(this.context),
      id,
      parseFinanceInput(z.string().uuid().optional(), cursor),
    );
  }

  @Post(":caseId/:action")
  @Header("Cache-Control", "private, no-store")
  @RequireFinanceAccess({
    kind: "staff",
    action: "RECONCILE",
    permission: "finance.payments.manage",
  })
  act(
    @Param("caseId", ParseUUIDPipe) id: string,
    @Param("action") action: string,
    @Body() body: unknown,
  ) {
    const input = parseFinanceInput(financeCaseActionSchema, body);
    const parsed = parseFinanceInput(actionSchema, action);
    return this.cases.act(financeRequestActor(this.context), id, parsed, input);
  }
}

const actionSchema = z
  .enum(["acknowledge", "recheck", "replay"])
  .transform((action) =>
    action === "acknowledge"
      ? ("ACKNOWLEDGE" as const)
      : action === "recheck"
        ? ("RECHECK" as const)
        : ("REPLAY" as const),
  );
