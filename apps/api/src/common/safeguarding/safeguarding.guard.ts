import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Inject,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PathwayRequestContext } from "@pathway/auth";
import type { PermissionKey } from "@pathway/platform";
import { EffectivePermissionsService } from "../../access-control/effective-permissions.service";
import { SAFEGUARDING_ROLES_KEY } from "./safeguarding.decorator";
import type { SafeguardingRoleRequirement } from "./safeguarding.types";

@Injectable()
export class SafeguardingGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(PathwayRequestContext)
    private readonly requestContext: PathwayRequestContext,
    @Inject(EffectivePermissionsService)
    private readonly permissions: EffectivePermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requirement =
      this.reflector.getAllAndOverride<SafeguardingRoleRequirement>(
        SAFEGUARDING_ROLES_KEY,
        [context.getHandler(), context.getClass()],
      );

    if (!requirement) {
      return true;
    }

    const roles = this.requestContext.roles;
    const hasTenantRole =
      requirement.tenantRoles?.some((role) => roles.tenant.includes(role)) ??
      false;
    const hasOrgRole =
      requirement.orgRoles?.some((role) => roles.org.includes(role)) ?? false;

    if (hasTenantRole || hasOrgRole) {
      return true;
    }

    const actor = this.requestContext.getContext();
    if (
      actor?.user.isSuperUser &&
      actor.user.userId &&
      actor.org.orgId &&
      actor.tenant.tenantId &&
      actor.tenant.orgId === actor.org.orgId
    ) {
      const method = context
        .switchToHttp()
        .getRequest<{ method?: string }>().method;
      const permission: PermissionKey | undefined =
        method === "GET"
          ? "safeguarding.concerns.read"
          : method === "POST"
            ? "safeguarding.concerns.record"
            : method === "PATCH" || method === "DELETE"
              ? "safeguarding.concerns.manage"
              : undefined;
      if (permission) {
        const decision = await this.permissions.resolve({
          userId: actor.user.userId,
          orgId: actor.org.orgId,
          tenantId: actor.tenant.tenantId,
          permission,
          now: new Date(),
        });
        if (decision.allowed && decision.sourceSuperUser) return true;
      }
    }

    throw new ForbiddenException("Insufficient safeguarding permissions");
  }
}
