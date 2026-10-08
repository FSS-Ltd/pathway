import { Controller, Get, UseGuards } from "@nestjs/common";
import { PathwayRequestContext } from "@pathway/auth";
import { AuthUserGuard } from "../auth/auth-user.guard";
import { FamilyContextsService } from "./family-contexts.service";

@UseGuards(AuthUserGuard)
@Controller("ace/family/contexts")
export class FamilyContextsController {
  constructor(
    private readonly service: FamilyContextsService,
    private readonly requestContext: PathwayRequestContext,
  ) {}

  @Get()
  list() {
    return this.service.list(this.requestContext.requireContext().user.userId);
  }
}
