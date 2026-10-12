import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Inject,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PathwayRequestContext } from "@pathway/auth";
import { SAFEGUARDING_ROLES_KEY } from "./safeguarding.decorator";
import type { SafeguardingRoleRequirement } from "./safeguarding.types";

@Injectable()
export class SafeguardingGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(PathwayRequestContext) private readonly requestContext: PathwayRequestContext,
  ) {}

  canActivate(context: ExecutionContext): boolean {
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

    throw new ForbiddenException("Insufficient safeguarding permissions");
  }
}

