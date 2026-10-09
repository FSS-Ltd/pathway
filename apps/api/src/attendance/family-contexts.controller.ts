import { Controller, Get, Inject, UseGuards } from "@nestjs/common";
import { PathwayRequestContext } from "@pathway/auth";
import { AuthUserGuard } from "../auth/auth-user.guard";
import { FamilyContextsService } from "./family-contexts.service";

@UseGuards(AuthUserGuard)
@Controller("ace/family/contexts")
export class FamilyContextsController {
  constructor(
    @Inject(FamilyContextsService)
    private readonly service: FamilyContextsService,
    @Inject(PathwayRequestContext)
    private readonly requestContext: PathwayRequestContext,
  ) {}

  @Get()
  list() {
    return this.service.list(this.requestContext.requireContext().user.userId);
  }
}
