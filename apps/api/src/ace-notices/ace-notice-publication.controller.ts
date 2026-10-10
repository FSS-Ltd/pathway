import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { PathwayRequestContext } from "@pathway/auth";
import { z } from "zod";
import { PermissionGuard } from "../access-control/permission.guard";
import { RequirePermission } from "../access-control/require-permission.decorator";
import { AuthUserGuard } from "../auth/auth-user.guard";
import { AceNoticePublicationService } from "./ace-notice-publication.service";
import { AceNoticeReceiptSummaryService } from "./ace-notice-receipt-summary.service";
import { AceNoticeSchedulingService } from "./ace-notice-scheduling.service";
import { noticeDraftIdSchema } from "./dto/ace-notice-draft.dto";
import {
  publishNoticeSchema,
  scheduleNoticeSchema,
  withdrawNoticeSchema,
} from "./dto/ace-notice-publication.dto";

@UseGuards(AuthUserGuard, PermissionGuard)
@Controller("ace/notices")
export class AceNoticePublicationController {
  constructor(
    @Inject(AceNoticePublicationService)
    private readonly service: AceNoticePublicationService,
    @Inject(AceNoticeReceiptSummaryService)
    private readonly receipts: AceNoticeReceiptSummaryService,
    @Inject(AceNoticeSchedulingService)
    private readonly scheduling: AceNoticeSchedulingService,
    @Inject(PathwayRequestContext)
    private readonly requestContext: PathwayRequestContext,
  ) {}

  @Get("drafts/:id/audience-preview")
  @RequirePermission("notices.publish")
  preview(@Param("id") id: string) {
    return this.service.preview(
      this.parse(noticeDraftIdSchema, id),
      this.actor(),
    );
  }

  @Post(":id/publish")
  @RequirePermission("notices.publish")
  publish(@Param("id") id: string, @Body() body: unknown) {
    return this.service.publish(
      this.parse(noticeDraftIdSchema, id),
      this.parse(publishNoticeSchema, body),
      this.actor(),
    );
  }

  @Get(":id/receipts")
  @RequirePermission("notices.publish")
  receiptSummary(@Param("id") id: string) {
    return this.receipts.get(this.parse(noticeDraftIdSchema, id), this.actor());
  }

  @Post(":id/schedule")
  @RequirePermission("notices.publish")
  schedule(@Param("id") id: string, @Body() body: unknown) {
    return this.scheduling.schedule(
      this.parse(noticeDraftIdSchema, id),
      this.parse(scheduleNoticeSchema, body),
      this.actor(),
    );
  }

  @Post(":id/cancel-schedule")
  @RequirePermission("notices.publish")
  cancelSchedule(@Param("id") id: string) {
    return this.scheduling.cancel(
      this.parse(noticeDraftIdSchema, id),
      this.actor(),
    );
  }

  @Post(":id/withdraw")
  @RequirePermission("notices.publish")
  withdraw(@Param("id") id: string, @Body() body: unknown) {
    return this.service.withdraw(
      this.parse(noticeDraftIdSchema, id),
      this.parse(withdrawNoticeSchema, body),
      this.actor(),
    );
  }

  private actor() {
    const context = this.requestContext.requireContext();
    return {
      tenantId: context.tenant.tenantId,
      orgId: context.org.orgId,
      userId: context.user.userId,
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
