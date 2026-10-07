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
import { PermissionGuard } from "../access-control/permission.guard";
import { RequirePermission } from "../access-control/require-permission.decorator";
import { AuthUserGuard } from "../auth/auth-user.guard";
import {
  conversationIdSchema,
  conversationQuerySchema,
  messageQuerySchema,
} from "./dto/messaging-query.dto";
import { MessagingQueryService } from "./messaging-query.service";

@UseGuards(AuthUserGuard, PermissionGuard)
@Controller("ace/messages/conversations")
export class MessagingController {
  constructor(
    private readonly service: MessagingQueryService,
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

  private actor() {
    const context = this.requestContext.requireContext();
    return {
      tenantId: context.tenant.tenantId,
      orgId: context.org.orgId,
      userId: context.user.userId,
    };
  }
}
