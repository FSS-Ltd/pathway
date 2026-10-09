import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Param,
  Query,
  UseGuards,
} from "@nestjs/common";
import { PathwayRequestContext } from "@pathway/auth";
import { AuthUserGuard } from "../auth/auth-user.guard";
import { familyDailyAttendanceQuerySchema } from "./dto/family-daily-attendance-query.dto";
import { StudentDailyAttendanceService } from "./student-daily-attendance.service";

@UseGuards(AuthUserGuard)
@Controller("ace/student/sites/:siteId/attendance/daily")
export class StudentDailyAttendanceController {
  constructor(
    @Inject(StudentDailyAttendanceService)
    private readonly service: StudentDailyAttendanceService,
    @Inject(PathwayRequestContext)
    private readonly requestContext: PathwayRequestContext,
  ) {}

  @Get()
  list(@Param("siteId") siteId: string, @Query() query: unknown) {
    const parsed = familyDailyAttendanceQuerySchema.safeParse(query);
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
