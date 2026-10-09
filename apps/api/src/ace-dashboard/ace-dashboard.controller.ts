import { Controller, Get, Inject, Query, UseGuards } from "@nestjs/common";
import { PathwayRequestContext } from "@pathway/auth";
import { PermissionGuard } from "../access-control/permission.guard";
import { RequirePermission } from "../access-control/require-permission.decorator";
import { AuthUserGuard } from "../auth/auth-user.guard";
import { AceDashboardService } from "./ace-dashboard.service";

@UseGuards(AuthUserGuard, PermissionGuard)
@Controller("ace/dashboard")
export class AceDashboardController {
  constructor(
    @Inject(AceDashboardService) private readonly service: AceDashboardService,
    @Inject(PathwayRequestContext)
    private readonly requestContext: PathwayRequestContext,
  ) {}

  @Get()
  @RequirePermission("ace.dashboard.read")
  get(@Query() query: unknown) {
    const context = this.requestContext.requireContext();
    return this.service.get(query, {
      tenantId: context.tenant.tenantId,
      orgId: context.org.orgId,
      userId: context.user.userId,
    });
  }
}
