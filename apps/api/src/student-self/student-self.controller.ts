import { Controller, Get, Inject, Param, UseGuards } from "@nestjs/common";
import { PathwayRequestContext } from "@pathway/auth";
import { AuthUserGuard } from "../auth/auth-user.guard";
import { StudentSelfService } from "./student-self.service";

@UseGuards(AuthUserGuard)
@Controller("ace/student/sites/:siteId/summary")
export class StudentSelfController {
  constructor(
    @Inject(StudentSelfService) private readonly service: StudentSelfService,
    @Inject(PathwayRequestContext)
    private readonly requestContext: PathwayRequestContext,
  ) {}

  @Get()
  summary(@Param("siteId") siteId: string) {
    return this.service.summary(
      siteId,
      this.requestContext.requireContext().user.userId,
    );
  }
}
