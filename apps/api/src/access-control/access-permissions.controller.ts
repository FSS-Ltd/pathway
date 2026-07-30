import { Controller, Get, Inject, Req, UseGuards } from "@nestjs/common";
import { PathwayRequestContext } from "@pathway/auth";
import { AuthUserGuard } from "../auth/auth-user.guard";
import { AccessPermissionsService } from "./access-permissions.service";
import { roleApiError } from "./role-api-error";
import type { RoleActorContext } from "./roles.service";
import {
  getOrCreateRequestId,
  type RequestWithRequestId,
} from "./request-id";

@UseGuards(AuthUserGuard)
@Controller("access/permissions")
export class AccessPermissionsController {
  constructor(
    @Inject(AccessPermissionsService)
    private readonly permissions: AccessPermissionsService,
    @Inject(PathwayRequestContext)
    private readonly requestContext: PathwayRequestContext,
  ) {}

  @Get("delegable")
  async listDelegable(@Req() request: RequestWithRequestId) {
    const requestId = getOrCreateRequestId(request);
    const delegableKeys = await this.permissions.listDelegableKeys(
      this.actor(request, requestId),
    );
    return { delegableKeys };
  }

  private actor(
    request: RequestWithRequestId,
    requestId = getOrCreateRequestId(request),
  ): RoleActorContext {
    const context = this.requestContext.requireContext();
    if (!context.org.orgId || !context.user.userId) {
      throw roleApiError(400, "INVALID_PERMISSIONS_REQUEST", requestId);
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
