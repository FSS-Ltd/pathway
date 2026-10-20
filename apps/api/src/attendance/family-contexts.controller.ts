import { Controller, Get, Inject, UseGuards } from "@nestjs/common";
import { PathwayRequestContext } from "@pathway/auth";
import { AuthUserGuard } from "../auth/auth-user.guard";
import { IndependentTransaction } from "../common/database/independent-transaction.decorator";
import { FamilyContextsService } from "./family-contexts.service";

@UseGuards(AuthUserGuard)
@IndependentTransaction()
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
