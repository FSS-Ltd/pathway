import {
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Param,
  UseGuards,
} from "@nestjs/common";
import { PathwayRequestContext } from "@pathway/auth";
import { AuthUserGuard } from "../auth/auth-user.guard";
import type { StudentOverviewResponse } from "./dto/student-overview.dto";
import { StudentOverviewService } from "./student-overview.service";

@UseGuards(AuthUserGuard)
@Controller("children/:childId/overview")
export class StaffStudentOverviewController {
  constructor(
    @Inject(StudentOverviewService)
    private readonly service: StudentOverviewService,
    @Inject(PathwayRequestContext)
    private readonly requestContext: PathwayRequestContext,
  ) {}

  @Get()
  read(@Param("childId") childId: string): Promise<StudentOverviewResponse> {
    const context = this.requestContext.requireContext();
    const isStaff =
      context.siteRole === "SITE_ADMIN" || context.siteRole === "STAFF";
    if (!isStaff) throw new ForbiddenException("Staff access required");
    return this.service.staff(childId, {
      siteId: context.tenant.tenantId,
      orgId: context.org.orgId,
      userId: context.user.userId,
      isSiteAdmin: context.siteRole === "SITE_ADMIN",
    });
  }
}

@UseGuards(AuthUserGuard)
@Controller("family/sites/:siteId/children/:childId/overview")
export class ParentStudentOverviewController {
  constructor(
    @Inject(StudentOverviewService)
    private readonly service: StudentOverviewService,
    @Inject(PathwayRequestContext)
    private readonly requestContext: PathwayRequestContext,
  ) {}

  @Get()
  read(
    @Param("siteId") siteId: string,
    @Param("childId") childId: string,
  ): Promise<StudentOverviewResponse> {
    return this.service.parent(
      siteId,
      childId,
      this.requestContext.requireContext().user.userId,
    );
  }
}
