import { Controller, Get, Inject, Param, UseGuards } from "@nestjs/common";
import { PathwayRequestContext } from "@pathway/auth";
import { AuthUserGuard } from "../auth/auth-user.guard";
import { FamilyService } from "./family.service";

@UseGuards(AuthUserGuard)
@Controller("ace/family/sites/:siteId/children/:childId/summary")
export class FamilyController {
  constructor(
    @Inject(FamilyService) private readonly service: FamilyService,
    @Inject(PathwayRequestContext)
    private readonly requestContext: PathwayRequestContext,
  ) {}

  @Get()
  summary(@Param("siteId") siteId: string, @Param("childId") childId: string) {
    return this.service.summary(
      siteId,
      childId,
      this.requestContext.requireContext().user.userId,
    );
  }
}
