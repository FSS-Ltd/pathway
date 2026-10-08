import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { PathwayRequestContext } from "@pathway/auth";
import { AuthUserGuard } from "../auth/auth-user.guard";
import { IndependentTransaction } from "../common/database/independent-transaction.decorator";
import { ParentMessagingService } from "./parent-messaging.service";

@UseGuards(AuthUserGuard)
@IndependentTransaction()
@Controller("ace/parent/sites/:siteId/messages/conversations")
export class ParentMessagingController {
  constructor(
    private readonly service: ParentMessagingService,
    private readonly requestContext: PathwayRequestContext,
  ) {}

  @Get()
  list(@Param("siteId") siteId: string) {
    return this.service.list(
      siteId,
      this.requestContext.requireContext().user.userId,
    );
  }
}
