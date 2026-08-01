import { Controller, Get, Inject, Query, Req, UseGuards } from "@nestjs/common";
import { PathwayRequestContext } from "@pathway/auth";
import { AuthUserGuard } from "../auth/auth-user.guard";
import { AccessAuditService } from "./access-audit.service";
import { auditListQueryDto } from "./dto/audit.dto";
import { PermissionGuard } from "./permission.guard";
import { RequirePermission } from "./require-permission.decorator";
import { roleApiError } from "./role-api-error";
import type { RoleActorContext } from "./roles.service";
import {
  getOrCreateRequestId,
  type RequestWithRequestId,
} from "./request-id";

@UseGuards(AuthUserGuard, PermissionGuard)
@Controller("access/audit")
export class AccessAuditController {
  constructor(
    @Inject(AccessAuditService) private readonly audit: AccessAuditService,
    @Inject(PathwayRequestContext)
    private readonly requestContext: PathwayRequestContext,
  ) {}

  @Get()
  @RequirePermission("platform.access.audit.read")
  async list(@Query() query: unknown, @Req() request: RequestWithRequestId) {
    const requestId = getOrCreateRequestId(request);
    const parsed = parseAuditListQuery(query, requestId);
    return this.audit.list(this.actor(request, requestId), parsed);
  }

  private actor(
    request: RequestWithRequestId,
    requestId = getOrCreateRequestId(request),
  ): RoleActorContext {
    const context = this.requestContext.requireContext();
    if (!context.org.orgId || !context.user.userId) {
      throw roleApiError(400, "INVALID_AUDIT_REQUEST", requestId);
    }
    return {
      orgId: context.org.orgId,
      tenantId: context.tenant.tenantId || undefined,
      userId: context.user.userId,
      legacyOrgRoles: context.roles.org,
      requestId,
    };
  }
}

function parseAuditListQuery(value: unknown, requestId: string) {
  const result = auditListQueryDto.safeParse(value);
  if (!result.success) {
    throw roleApiError(400, "INVALID_AUDIT_REQUEST", requestId, {
      fields: result.error.issues.map((issue) => issue.path.join(".")),
    });
  }
  return result.data;
}
