import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Param,
  UseGuards,
} from "@nestjs/common";
import { PathwayRequestContext } from "@pathway/auth";
import { AuthUserGuard } from "../auth/auth-user.guard";
import { HomeworkGuardianService } from "./homework-guardian.service";

@UseGuards(AuthUserGuard)
@Controller("ace/family/sites/:siteId/children/:childId/homework")
export class HomeworkGuardianController {
  constructor(
    @Inject(HomeworkGuardianService)
    private readonly service: HomeworkGuardianService,
    @Inject(PathwayRequestContext)
    private readonly requestContext: PathwayRequestContext,
  ) {}

  @Get()
  list(@Param("siteId") siteId: string, @Param("childId") childId: string) {
    if (!/^[0-9a-f-]{36}$/i.test(siteId) || !/^[0-9a-f-]{36}$/i.test(childId)) {
      throw new BadRequestException("Invalid homework request");
    }
    return this.service.list(
      siteId,
      childId,
      this.requestContext.requireContext().user.userId,
    );
  }
}
