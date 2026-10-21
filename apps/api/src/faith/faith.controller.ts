import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { PathwayRequestContext } from "@pathway/auth";
import { z } from "zod";
import { PermissionGuard } from "../access-control/permission.guard";
import { RequirePermission } from "../access-control/require-permission.decorator";
import { AuthUserGuard } from "../auth/auth-user.guard";
import { FaithService } from "./faith.service";
import {
  cancelFaithScheduleSchema,
  createFaithDraftSchema,
  faithIdSchema,
  faithListQuerySchema,
  faithSettingsSchema,
  publishFaithSchema,
  scheduleFaithSchema,
  updateFaithDraftSchema,
  withdrawFaithSchema,
} from "./faith.dto";

@UseGuards(AuthUserGuard, PermissionGuard)
@Controller("ace/faith")
export class FaithController {
  constructor(
    @Inject(FaithService) private readonly faith: FaithService,
    @Inject(PathwayRequestContext)
    private readonly context: PathwayRequestContext,
  ) {}

  @Get("content")
  @RequirePermission("ace.faith.manage")
  list(@Query() query: unknown) {
    return this.faith.list(
      this.parse(faithListQuerySchema, query),
      this.actor(),
    );
  }

  @Get("options")
  @RequirePermission("ace.faith.manage")
  options() {
    return this.faith.options(this.actor());
  }

  @Post("content")
  @RequirePermission("ace.faith.manage")
  create(@Body() body: unknown) {
    return this.faith.create(
      this.parse(createFaithDraftSchema, body),
      this.actor(),
    );
  }

  @Patch("content/:id/drafts/:draftId")
  @RequirePermission("ace.faith.manage")
  updateDraft(
    @Param("id") id: string,
    @Param("draftId") draftId: string,
    @Body() body: unknown,
  ) {
    return this.faith.updateDraft(
      this.parse(faithIdSchema, id),
      this.parse(faithIdSchema, draftId),
      this.parse(updateFaithDraftSchema, body),
      this.actor(),
    );
  }

  @Post("content/:id/publish")
  @RequirePermission("ace.faith.publish")
  publish(@Param("id") id: string, @Body() body: unknown) {
    return this.faith.publish(
      this.parse(faithIdSchema, id),
      this.parse(publishFaithSchema, body),
      this.actor(),
    );
  }

  @Post("content/:id/schedule")
  @RequirePermission("ace.faith.publish")
  schedule(@Param("id") id: string, @Body() body: unknown) {
    return this.faith.schedule(
      this.parse(faithIdSchema, id),
      this.parse(scheduleFaithSchema, body),
      this.actor(),
    );
  }

  @Post("content/:id/cancel-schedule")
  @RequirePermission("ace.faith.publish")
  cancelSchedule(@Param("id") id: string, @Body() body: unknown) {
    return this.faith.cancelSchedule(
      this.parse(faithIdSchema, id),
      this.parse(cancelFaithScheduleSchema, body),
      this.actor(),
    );
  }

  @Post("content/:id/withdraw")
  @RequirePermission("ace.faith.publish")
  withdraw(@Param("id") id: string, @Body() body: unknown) {
    return this.faith.withdraw(
      this.parse(faithIdSchema, id),
      this.parse(withdrawFaithSchema, body),
      this.actor(),
    );
  }

  @Get("settings")
  @RequirePermission("ace.faith.manage")
  settings() {
    return this.faith.settings(this.actor());
  }

  @Patch("settings")
  @RequirePermission("ace.faith.publish")
  updateSettings(@Body() body: unknown) {
    return this.faith.updateSettings(
      this.parse(faithSettingsSchema, body),
      this.actor(),
    );
  }

  private actor() {
    const value = this.context.requireContext();
    return {
      tenantId: value.tenant.tenantId,
      orgId: value.org.orgId,
      userId: value.user.userId,
    };
  }

  private parse<T extends z.ZodTypeAny>(
    schema: T,
    value: unknown,
  ): z.output<T> {
    const result = schema.safeParse(value);
    if (!result.success) throw new BadRequestException(result.error.flatten());
    return result.data;
  }
}
