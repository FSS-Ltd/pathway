import {
  Body,
  Controller,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
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
import {
  financeRecurringInvoiceTemplateIdSchema,
  financeRecurringInvoiceTemplateSchema,
  financeRecurringInvoiceTemplateStatusSchema,
} from "./dto/finance-recurring-invoice-template.dto";
import { FinanceRecurringInvoiceService } from "./finance-recurring-invoice.service";

@Controller("finance/recurring-invoice-templates")
@UseGuards(AuthUserGuard, FinanceAccessGuard, PermissionGuard)
export class FinanceRecurringInvoiceController {
  constructor(
    private readonly templates: FinanceRecurringInvoiceService,
    private readonly requestContext: PathwayRequestContext,
  ) {}

  @Post()
  @Header("Cache-Control", "private, no-store")
  @RequireFinanceAccess({
    kind: "staff",
    action: "CREATE_INVOICE",
    permission: "finance.invoices.manage",
  })
  create(@Body() body: unknown) {
    return this.templates.createTemplate(
      financeRequestActor(this.requestContext),
      parseFinanceInput(financeRecurringInvoiceTemplateSchema, body),
    );
  }

  @Patch(":templateId/status")
  @Header("Cache-Control", "private, no-store")
  @RequireFinanceAccess({
    kind: "staff",
    action: "UPDATE_INVOICE",
    permission: "finance.invoices.manage",
  })
  setStatus(
    @Param("templateId", ParseUUIDPipe) templateId: string,
    @Body() body: unknown,
  ) {
    parseFinanceInput(financeRecurringInvoiceTemplateIdSchema, templateId);
    const { status } = parseFinanceInput(
      financeRecurringInvoiceTemplateStatusSchema,
      body,
    );
    return this.templates.setTemplateStatus(
      financeRequestActor(this.requestContext),
      templateId,
      status,
    );
  }
}
