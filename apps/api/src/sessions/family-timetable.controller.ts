import {
  Controller,
  Get,
  Inject,
  Param,
  Query,
  UseGuards,
} from "@nestjs/common";
import { PathwayRequestContext } from "@pathway/auth";
import { AuthUserGuard } from "../auth/auth-user.guard";
import { parseFamilyTimetableRange } from "./dto/family-timetable-query.dto";
import { FamilyTimetableService } from "./family-timetable.service";

@UseGuards(AuthUserGuard)
@Controller("ace/parent/sites/:siteId/children/:childId/timetable")
export class ParentTimetableController {
  constructor(
    @Inject(FamilyTimetableService)
    private readonly service: FamilyTimetableService,
    @Inject(PathwayRequestContext)
    private readonly requestContext: PathwayRequestContext,
  ) {}

  @Get()
  list(
    @Param("siteId") siteId: string,
    @Param("childId") childId: string,
    @Query() query: unknown,
  ) {
    return this.service.list(
      siteId,
      this.requestContext.requireContext().user.userId,
      { kind: "parent", childId },
      parseFamilyTimetableRange(query),
    );
  }
}

@UseGuards(AuthUserGuard)
@Controller("ace/student/sites/:siteId/timetable")
export class StudentTimetableController {
  constructor(
    @Inject(FamilyTimetableService)
    private readonly service: FamilyTimetableService,
    @Inject(PathwayRequestContext)
    private readonly requestContext: PathwayRequestContext,
  ) {}

  @Get()
  list(@Param("siteId") siteId: string, @Query() query: unknown) {
    return this.service.list(
      siteId,
      this.requestContext.requireContext().user.userId,
      { kind: "student" },
      parseFamilyTimetableRange(query),
    );
  }
}
