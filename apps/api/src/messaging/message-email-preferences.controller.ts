import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Put,
  UseGuards,
} from "@nestjs/common";
import { PathwayRequestContext } from "@pathway/auth";
import { z } from "zod";
import { PermissionGuard } from "../access-control/permission.guard";
import { RequirePermission } from "../access-control/require-permission.decorator";
import { AuthUserGuard } from "../auth/auth-user.guard";
import { IndependentTransaction } from "../common/database/independent-transaction.decorator";
import { conversationIdSchema } from "./dto/messaging-query.dto";
import {
  MessageEmailPreferencesService,
  messageEmailPreferenceSchema,
  messageMuteSchema,
} from "./message-email-preferences.service";

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new BadRequestException(result.error.flatten());
  return result.data;
}

@UseGuards(AuthUserGuard, PermissionGuard)
@IndependentTransaction()
@Controller("ace/messages/notifications")
export class StaffMessageEmailPreferencesController {
  constructor(
    @Inject(MessageEmailPreferencesService)
    private readonly preferences: MessageEmailPreferencesService,
    @Inject(PathwayRequestContext)
    private readonly context: PathwayRequestContext,
  ) {}

  @Get()
  @RequirePermission("messaging.messages.read")
  get() {
    return this.preferences.getStaff(this.actor());
  }

  @Put()
  @RequirePermission("messaging.messages.read")
  save(@Body() body: unknown) {
    return this.preferences.saveStaff(
      this.actor(),
      parse(messageEmailPreferenceSchema, body),
    );
  }

  @Put("conversations/:id/mute")
  @RequirePermission("messaging.messages.read")
  mute(@Param("id") id: string, @Body() body: unknown) {
    return this.preferences.muteStaff(
      this.actor(),
      parse(conversationIdSchema, id),
      parse(messageMuteSchema, body).muted,
    );
  }

  @Get("conversations/:id/mute")
  @RequirePermission("messaging.messages.read")
  getMute(@Param("id") id: string) {
    return this.preferences.getMuteStaff(
      this.actor(),
      parse(conversationIdSchema, id),
    );
  }

  private actor() {
    const context = this.context.requireContext();
    return {
      tenantId: context.tenant.tenantId,
      orgId: context.org.orgId,
      userId: context.user.userId,
    };
  }
}

@UseGuards(AuthUserGuard)
@IndependentTransaction()
@Controller("ace/parent/sites/:siteId/messages/notifications")
export class ParentMessageEmailPreferencesController {
  constructor(
    @Inject(MessageEmailPreferencesService)
    private readonly preferences: MessageEmailPreferencesService,
    @Inject(PathwayRequestContext)
    private readonly context: PathwayRequestContext,
  ) {}

  @Get()
  get(@Param("siteId") siteId: string) {
    return this.preferences.getParent(
      siteId,
      this.context.requireContext().user.userId,
    );
  }

  @Put()
  save(@Param("siteId") siteId: string, @Body() body: unknown) {
    return this.preferences.saveParent(
      siteId,
      this.context.requireContext().user.userId,
      parse(messageEmailPreferenceSchema, body),
    );
  }

  @Put("conversations/:id/mute")
  mute(
    @Param("siteId") siteId: string,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.preferences.muteParent(
      siteId,
      this.context.requireContext().user.userId,
      parse(conversationIdSchema, id),
      parse(messageMuteSchema, body).muted,
    );
  }

  @Get("conversations/:id/mute")
  getMute(@Param("siteId") siteId: string, @Param("id") id: string) {
    return this.preferences.getMuteParent(
      siteId,
      this.context.requireContext().user.userId,
      parse(conversationIdSchema, id),
    );
  }
}
