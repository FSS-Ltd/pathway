import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Put,
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
  readCursorSchema,
} from "./dto/messaging-query.dto";
import { ParentMessagingHistoryService } from "./parent-messaging-history.service";
import { ParentMessagingReadCursorService } from "./parent-messaging-read-cursor.service";
import { ParentMessagingService } from "./parent-messaging.service";

@UseGuards(AuthUserGuard)
@IndependentTransaction()
@Controller("ace/parent/sites/:siteId/messages/conversations")
export class ParentMessagingController {
  constructor(
    private readonly service: ParentMessagingService,
    private readonly history: ParentMessagingHistoryService,
    private readonly readCursor: ParentMessagingReadCursorService,
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

  @Put(":id/read-cursor")
  async advanceReadCursor(
    @Param("siteId") siteId: string,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    try {
      return await this.readCursor.advance(
        siteId,
        this.requestContext.requireContext().user.userId,
        await conversationIdSchema.parseAsync(id),
        await readCursorSchema.parseAsync(body),
      );
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new BadRequestException(error.flatten());
      }
      throw error;
    }
  }
}
