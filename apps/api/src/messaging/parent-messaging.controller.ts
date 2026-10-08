import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import { PathwayRequestContext } from "@pathway/auth";
import { z } from "zod";
import { AuthUserGuard } from "../auth/auth-user.guard";
import { IndependentTransaction } from "../common/database/independent-transaction.decorator";
import { createParentConversationSchema } from "./dto/messaging-command.dto";
import {
  conversationIdSchema,
  messageQuerySchema,
  parentRecipientQuerySchema,
  readCursorSchema,
} from "./dto/messaging-query.dto";
import { ParentMessagingHistoryService } from "./parent-messaging-history.service";
import { ParentMessagingConversationService } from "./parent-messaging-conversation.service";
import { ParentMessagingReadCursorService } from "./parent-messaging-read-cursor.service";
import { ParentMessagingService } from "./parent-messaging.service";

@UseGuards(AuthUserGuard)
@IndependentTransaction()
@Controller("ace/parent/sites/:siteId/messages/conversations")
export class ParentMessagingController {
  constructor(
    private readonly service: ParentMessagingService,
    private readonly history: ParentMessagingHistoryService,
    private readonly conversations: ParentMessagingConversationService,
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

  @Get("recipients")
  async recipients(@Param("siteId") siteId: string, @Query() query: unknown) {
    try {
      return await this.conversations.recipients(
        siteId,
        this.requestContext.requireContext().user.userId,
        await parentRecipientQuerySchema.parseAsync(query),
      );
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new BadRequestException(error.flatten());
      }
      throw error;
    }
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  async open(@Param("siteId") siteId: string, @Body() body: unknown) {
    try {
      return await this.conversations.open(
        siteId,
        this.requestContext.requireContext().user.userId,
        await createParentConversationSchema.parseAsync(body),
      );
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new BadRequestException(error.flatten());
      }
      throw error;
    }
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
