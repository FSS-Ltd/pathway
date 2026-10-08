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
import { PermissionGuard } from "../access-control/permission.guard";
import { RequirePermission } from "../access-control/require-permission.decorator";
import { AuthUserGuard } from "../auth/auth-user.guard";
import {
  createStaffConversationSchema,
  sendStaffMessageSchema,
} from "./dto/messaging-command.dto";
import {
  conversationIdSchema,
  conversationQuerySchema,
  messageQuerySchema,
  readCursorSchema,
  staffRecipientQuerySchema,
} from "./dto/messaging-query.dto";
import { MessagingService } from "./messaging.service";
import { MessagingConversationService } from "./messaging-conversation.service";
import { MessagingCommandService } from "./messaging-command.service";

@UseGuards(AuthUserGuard, PermissionGuard)
@Controller("ace/messages/conversations")
export class MessagingController {
  constructor(
    private readonly service: MessagingService,
    private readonly conversations: MessagingConversationService,
    private readonly commands: MessagingCommandService,
    private readonly requestContext: PathwayRequestContext,
  ) {}

  @Get()
  @RequirePermission("messaging.conversations.read")
  async list(@Query() query: unknown) {
    try {
      return await this.service.listStaffConversations(
        this.actor(),
        await conversationQuerySchema.parseAsync(query),
      );
    } catch (error) {
      if (error instanceof z.ZodError)
        throw new BadRequestException(error.flatten());
      throw error;
    }
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @RequirePermission("messaging.conversations.create")
  async create(@Body() body: unknown) {
    try {
      const input = await createStaffConversationSchema.parseAsync(body);
      if (input.kind === "STAFF_ROOM") {
        return await this.conversations.openStaffRoom(this.actor());
      }
      return await this.conversations.openStaffDirect(this.actor(), input);
    } catch (error) {
      if (error instanceof z.ZodError)
        throw new BadRequestException(error.flatten());
      throw error;
    }
  }

  @Get("recipients")
  @RequirePermission("messaging.conversations.create")
  async recipients(@Query() query: unknown) {
    try {
      return await this.conversations.listStaffRecipients(
        this.actor(),
        await staffRecipientQuerySchema.parseAsync(query),
      );
    } catch (error) {
      if (error instanceof z.ZodError)
        throw new BadRequestException(error.flatten());
      throw error;
    }
  }

  @Get(":id/messages")
  @RequirePermission("messaging.messages.read")
  async messages(@Param("id") id: string, @Query() query: unknown) {
    try {
      return await this.service.listStaffMessages(
        this.actor(),
        await conversationIdSchema.parseAsync(id),
        await messageQuerySchema.parseAsync(query),
      );
    } catch (error) {
      if (error instanceof z.ZodError)
        throw new BadRequestException(error.flatten());
      throw error;
    }
  }

  @Post(":id/messages")
  @HttpCode(HttpStatus.OK)
  @RequirePermission("messaging.messages.send")
  async send(@Param("id") id: string, @Body() body: unknown) {
    try {
      return await this.commands.sendStaffMessage(
        this.actor(),
        await conversationIdSchema.parseAsync(id),
        await sendStaffMessageSchema.parseAsync(body),
      );
    } catch (error) {
      if (error instanceof z.ZodError)
        throw new BadRequestException(error.flatten());
      throw error;
    }
  }

  @Put(":id/read-cursor")
  @RequirePermission("messaging.messages.read")
  async readCursor(@Param("id") id: string, @Body() body: unknown) {
    try {
      return await this.service.advanceStaffReadCursor(
        this.actor(),
        await conversationIdSchema.parseAsync(id),
        await readCursorSchema.parseAsync(body),
      );
    } catch (error) {
      if (error instanceof z.ZodError)
        throw new BadRequestException(error.flatten());
      throw error;
    }
  }

  private actor() {
    const context = this.requestContext.requireContext();
    return {
      tenantId: context.tenant.tenantId,
      orgId: context.org.orgId,
      userId: context.user.userId,
    };
  }
}
