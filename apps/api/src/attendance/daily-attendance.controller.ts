import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Param,
  Put,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import { PathwayRequestContext } from "@pathway/auth";
import type { Response } from "express";
import { PermissionGuard } from "../access-control/permission.guard";
import { RequirePermission } from "../access-control/require-permission.decorator";
import { isDateOnly } from "../ace-settings/dto/academic-calendar.dto";
import { AuthUserGuard } from "../auth/auth-user.guard";
import { DailyAttendanceService } from "./daily-attendance.service";
import { DailyAttendanceExportService } from "./daily-attendance-export.service";
import { DailyAttendanceHistoryService } from "./daily-attendance-history.service";
import { DailyAttendanceWriteService } from "./daily-attendance-write.service";
import { attendanceHistoryQuerySchema } from "./dto/attendance-history-query.dto";
import { dailyAttendanceMarkSchema } from "./dto/daily-attendance-mark.dto";
import { dailyAttendanceQuerySchema } from "./dto/daily-attendance-query.dto";
import { dailyAttendanceExportQuerySchema } from "./dto/daily-attendance-export-query.dto";

@UseGuards(AuthUserGuard, PermissionGuard)
@Controller("attendance/daily")
export class DailyAttendanceController {
  constructor(
    @Inject(DailyAttendanceService)
    private readonly service: DailyAttendanceService,
    @Inject(DailyAttendanceExportService)
    private readonly exportService: DailyAttendanceExportService,
    @Inject(DailyAttendanceWriteService)
    private readonly writeService: DailyAttendanceWriteService,
    @Inject(DailyAttendanceHistoryService)
    private readonly historyService: DailyAttendanceHistoryService,
    @Inject(PathwayRequestContext)
    private readonly requestContext: PathwayRequestContext,
  ) {}

  @Get()
  @RequirePermission("attendance.read")
  list(@Query() query: unknown) {
    const parsed = dailyAttendanceQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    const context = this.requestContext.requireContext();
    return this.service.list(parsed.data, {
      tenantId: context.tenant.tenantId,
      orgId: context.org.orgId,
      userId: context.user.userId,
    });
  }

  @Get("export")
  @RequirePermission("ace.attendance.export")
  @Header("Content-Type", "text/csv; charset=utf-8")
  async export(
    @Query() query: unknown,
    @Res() response: Response,
  ): Promise<void> {
    const parsed = dailyAttendanceExportQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    const context = this.requestContext.requireContext();
    const csv = await this.exportService.export(parsed.data, {
      tenantId: context.tenant.tenantId,
      orgId: context.org.orgId,
      userId: context.user.userId,
    });
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="nexsteps-ace-attendance-${parsed.data.from}-${parsed.data.to}.csv"`,
    );
    response.send(csv);
  }

  @Get(":id/history")
  @RequirePermission("attendance.read")
  history(@Param("id") id: string, @Query() query: unknown) {
    const parsed = attendanceHistoryQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    const context = this.requestContext.requireContext();
    return this.historyService.list(id, parsed.data, {
      tenantId: context.tenant.tenantId,
      orgId: context.org.orgId,
      userId: context.user.userId,
    });
  }

  @Put(":date/children/:childId")
  @RequirePermission("attendance.manage")
  save(
    @Param("date") date: string,
    @Param("childId") childId: string,
    @Body() body: unknown,
  ) {
    if (!isDateOnly(date)) {
      throw new BadRequestException("Use a valid date in YYYY-MM-DD format");
    }
    const parsed = dailyAttendanceMarkSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    const context = this.requestContext.requireContext();
    return this.writeService.save(date, childId, parsed.data, {
      tenantId: context.tenant.tenantId,
      orgId: context.org.orgId,
      userId: context.user.userId,
    });
  }
}
