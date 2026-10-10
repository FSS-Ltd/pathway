import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { PathwayRequestContext } from "@pathway/auth";
import { z } from "zod";
import { PermissionGuard } from "../access-control/permission.guard";
import { RequirePermission } from "../access-control/require-permission.decorator";
import { AuthUserGuard } from "../auth/auth-user.guard";
import { AceNoticeStaffInboxService } from "./ace-notice-staff-inbox.service";
import { noticeDraftIdSchema } from "./dto/ace-notice-draft.dto";
import { listNoticeInboxSchema } from "./dto/ace-notice-inbox.dto";

@UseGuards(AuthUserGuard, PermissionGuard)
@RequirePermission("notices.read")
@Controller("ace/notices")
export class AceNoticeStaffInboxController {
  constructor(
    @Inject(AceNoticeStaffInboxService)
    private readonly service: AceNoticeStaffInboxService,
    @Inject(PathwayRequestContext)
    private readonly requestContext: PathwayRequestContext,
  ) {}

  @Get()
  list(@Query() query: unknown) {
    return this.service.list(
      this.parse(listNoticeInboxSchema, query),
      this.actor(),
    );
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.service.get(this.parse(noticeDraftIdSchema, id), this.actor());
  }

  @Post(":id/read")
  markRead(@Param("id") id: string) {
    return this.service.markRead(
      this.parse(noticeDraftIdSchema, id),
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
