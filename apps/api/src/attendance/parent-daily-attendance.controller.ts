import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from "@nestjs/common";
import { PathwayRequestContext } from "@pathway/auth";
import { AuthUserGuard } from "../auth/auth-user.guard";
import { familyDailyAttendanceQuerySchema } from "./dto/family-daily-attendance-query.dto";
import { ParentDailyAttendanceService } from "./parent-daily-attendance.service";

@UseGuards(AuthUserGuard)
@Controller("ace/parent/sites/:siteId/children/:childId/attendance/daily")
export class ParentDailyAttendanceController {
  constructor(
    private readonly service: ParentDailyAttendanceService,
    private readonly requestContext: PathwayRequestContext,
  ) {}

  @Get()
  list(
    @Param("siteId") siteId: string,
    @Param("childId") childId: string,
    @Query() query: unknown,
  ) {
    const parsed = familyDailyAttendanceQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.service.list(
      siteId,
      childId,
      parsed.data,
      this.requestContext.requireContext().user.userId,
    );
  }
}
