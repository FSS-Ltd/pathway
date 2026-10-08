import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import { PathwayRequestContext } from "@pathway/auth";
import { PermissionGuard } from "../access-control/permission.guard";
import { RequirePermission } from "../access-control/require-permission.decorator";
import { isDateOnly } from "../ace-settings/dto/academic-calendar.dto";
import { AuthUserGuard } from "../auth/auth-user.guard";
import { DailyAttendanceService } from "./daily-attendance.service";
import { DailyAttendanceWriteService } from "./daily-attendance-write.service";
import { dailyAttendanceMarkSchema } from "./dto/daily-attendance-mark.dto";
import { dailyAttendanceQuerySchema } from "./dto/daily-attendance-query.dto";

@UseGuards(AuthUserGuard, PermissionGuard)
@Controller("attendance/daily")
export class DailyAttendanceController {
  constructor(
    private readonly service: DailyAttendanceService,
    private readonly writeService: DailyAttendanceWriteService,
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
