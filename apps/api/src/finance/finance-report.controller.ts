import {
  Controller,
  Get,
  Header,
  Inject,
  Param,
  Query,
  StreamableFile,
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
  financeReportFiltersSchema,
  financeReportTypeSchema,
} from "./dto/finance-report.dto";
import { FinanceReportService } from "./finance-report.service";

@Controller("finance/reports")
@UseGuards(AuthUserGuard, FinanceAccessGuard, PermissionGuard)
export class FinanceReportController {
  constructor(
    @Inject(FinanceReportService)
    private readonly reports: FinanceReportService,
    @Inject(PathwayRequestContext)
    private readonly requestContext: PathwayRequestContext,
  ) {}

  @Get("summary")
  @Header("Cache-Control", "private, no-store")
  @RequireFinanceAccess({
    kind: "staff",
    action: "READ_RECORDS",
    permission: "finance.invoices.read",
  })
  summary(@Query() query: unknown) {
    return this.reports.summary(
      financeRequestActor(this.requestContext),
      parseFinanceInput(financeReportFiltersSchema, query),
    );
  }

  @Get(":reportType")
  @Header("Cache-Control", "private, no-store")
  @RequireFinanceAccess({
    kind: "staff",
    action: "READ_RECORDS",
    permission: "finance.invoices.read",
  })
  report(@Param("reportType") reportType: string, @Query() query: unknown) {
    return this.reports.report(
      financeRequestActor(this.requestContext),
      parseFinanceInput(financeReportTypeSchema, reportType),
      parseFinanceInput(financeReportFiltersSchema, query),
    );
  }

  @Get(":reportType/export")
  @Header("Cache-Control", "private, no-store")
  @Header("Content-Type", "text/csv; charset=utf-8")
  @RequireFinanceAccess({
    kind: "staff",
    action: "EXPORT_REPORT",
    permission: "finance.exports.create",
  })
  async exportCsv(
    @Param("reportType") reportType: string,
    @Query() query: unknown,
  ): Promise<StreamableFile> {
    const result = await this.reports.exportCsv(
      financeRequestActor(this.requestContext),
      parseFinanceInput(financeReportTypeSchema, reportType),
      parseFinanceInput(financeReportFiltersSchema, query),
    );
    return new StreamableFile(Buffer.from(result.csv, "utf8"), {
      disposition: `attachment; filename="${result.filename}"`,
      type: "text/csv; charset=utf-8",
    });
  }
}
