import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Query,
  UseGuards,
} from "@nestjs/common";
import { PathwayRequestContext } from "@pathway/auth";
import { PermissionGuard } from "../access-control/permission.guard";
import { RequirePermission } from "../access-control/require-permission.decorator";
import { AuthUserGuard } from "../auth/auth-user.guard";
import { AceNoticeTargetsService } from "./ace-notice-targets.service";
import { noticeTargetQuerySchema } from "./dto/ace-notice-target.dto";

@UseGuards(AuthUserGuard, PermissionGuard)
@Controller("ace/notices/targets")
export class AceNoticeTargetsController {
  constructor(
    @Inject(AceNoticeTargetsService)
    private readonly service: AceNoticeTargetsService,
    @Inject(PathwayRequestContext)
    private readonly requestContext: PathwayRequestContext,
  ) {}

  @Get()
  @RequirePermission("notices.manage")
  list(@Query() rawQuery: unknown) {
    const query = noticeTargetQuerySchema.safeParse(rawQuery);
    if (!query.success) throw new BadRequestException(query.error.flatten());
    const context = this.requestContext.requireContext();
    return this.service.list(query.data, {
      tenantId: context.tenant.tenantId,
      orgId: context.org.orgId,
      userId: context.user.userId,
    });
  }
}
