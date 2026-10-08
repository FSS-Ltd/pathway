import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from "@nestjs/common";
import { PathwayRequestContext } from "@pathway/auth";
import { z } from "zod";
import { AuthUserGuard } from "../auth/auth-user.guard";
import { IndependentTransaction } from "../common/database/independent-transaction.decorator";
import {
  conversationIdSchema,
  messageQuerySchema,
} from "./dto/messaging-query.dto";
import { ParentMessagingHistoryService } from "./parent-messaging-history.service";
import { ParentMessagingService } from "./parent-messaging.service";

@UseGuards(AuthUserGuard)
@IndependentTransaction()
@Controller("ace/parent/sites/:siteId/messages/conversations")
export class ParentMessagingController {
  constructor(
    private readonly service: ParentMessagingService,
    private readonly history: ParentMessagingHistoryService,
    private readonly requestContext: PathwayRequestContext,
  ) {}

  @Get()
  list(@Param("siteId") siteId: string) {
    return this.service.list(
      siteId,
      this.requestContext.requireContext().user.userId,
    );
  }

  @Get(":id/messages")
  async messages(
    @Param("siteId") siteId: string,
    @Param("id") id: string,
    @Query() query: unknown,
  ) {
    try {
      return await this.history.list(
        siteId,
        this.requestContext.requireContext().user.userId,
        await conversationIdSchema.parseAsync(id),
        await messageQuerySchema.parseAsync(query),
      );
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new BadRequestException(error.flatten());
      }
      throw error;
    }
  }
}
