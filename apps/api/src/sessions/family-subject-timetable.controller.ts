import { Controller, Get, Inject, Param, UseGuards } from "@nestjs/common";
import { PathwayRequestContext } from "@pathway/auth";
import { AuthUserGuard } from "../auth/auth-user.guard";
import { FamilySubjectTimetableService } from "./family-subject-timetable.service";

@UseGuards(AuthUserGuard)
@Controller("ace/parent/sites/:siteId/children/:childId/subject-timetable")
export class ParentSubjectTimetableController {
  constructor(
    @Inject(FamilySubjectTimetableService)
    private readonly service: FamilySubjectTimetableService,
    @Inject(PathwayRequestContext)
    private readonly requestContext: PathwayRequestContext,
  ) {}

  @Get()
  list(@Param("siteId") siteId: string, @Param("childId") childId: string) {
    return this.service.list(
      siteId,
      this.requestContext.requireContext().user.userId,
      { kind: "parent", childId },
    );
  }

  @Get(":periodId")
  get(
    @Param("siteId") siteId: string,
    @Param("childId") childId: string,
    @Param("periodId") periodId: string,
  ) {
    return this.service.get(
      siteId,
      this.requestContext.requireContext().user.userId,
      { kind: "parent", childId },
      periodId,
    );
  }
}

@UseGuards(AuthUserGuard)
@Controller("ace/student/sites/:siteId/subject-timetable")
export class StudentSubjectTimetableController {
  constructor(
    @Inject(FamilySubjectTimetableService)
    private readonly service: FamilySubjectTimetableService,
    @Inject(PathwayRequestContext)
    private readonly requestContext: PathwayRequestContext,
  ) {}

  @Get()
  list(@Param("siteId") siteId: string) {
    return this.service.list(
      siteId,
      this.requestContext.requireContext().user.userId,
      { kind: "student" },
    );
  }

  @Get(":periodId")
  get(@Param("siteId") siteId: string, @Param("periodId") periodId: string) {
    return this.service.get(
      siteId,
      this.requestContext.requireContext().user.userId,
      { kind: "student" },
      periodId,
    );
  }
}
