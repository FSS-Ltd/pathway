import {
  BadRequestException,
  Controller,
  Get,
  Query,
  UseGuards,
} from "@nestjs/common";
import { PathwayRequestContext } from "@pathway/auth";
import { PermissionGuard } from "../access-control/permission.guard";
import { RequirePermission } from "../access-control/require-permission.decorator";
import { AuthUserGuard } from "../auth/auth-user.guard";
import { DailyAttendanceService } from "./daily-attendance.service";
import { dailyAttendanceQuerySchema } from "./dto/daily-attendance-query.dto";

@UseGuards(AuthUserGuard, PermissionGuard)
@Controller("attendance/daily")
export class DailyAttendanceController {
  constructor(
    private readonly service: DailyAttendanceService,
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
}
