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
import { studentDailyAttendanceQuerySchema } from "./dto/student-daily-attendance-query.dto";
import { StudentDailyAttendanceService } from "./student-daily-attendance.service";

@UseGuards(AuthUserGuard)
@Controller("ace/student/sites/:siteId/attendance/daily")
export class StudentDailyAttendanceController {
  constructor(
    private readonly service: StudentDailyAttendanceService,
    private readonly requestContext: PathwayRequestContext,
  ) {}

  @Get()
  list(@Param("siteId") siteId: string, @Query() query: unknown) {
    const parsed = studentDailyAttendanceQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.service.list(
      siteId,
      parsed.data,
      this.requestContext.requireContext().user.userId,
    );
  }
}
