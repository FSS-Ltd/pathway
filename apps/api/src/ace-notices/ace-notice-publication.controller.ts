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
import { noticeDraftIdSchema } from "./dto/ace-notice-draft.dto";
import {
  publishNoticeSchema,
  withdrawNoticeSchema,
} from "./dto/ace-notice-publication.dto";

@UseGuards(AuthUserGuard, PermissionGuard)
@Controller("ace/notices")
export class AceNoticePublicationController {
  constructor(
    @Inject(AceNoticePublicationService)
    private readonly service: AceNoticePublicationService,
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
