import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PathwayRequestContext } from "@pathway/auth";
import type { PermissionKey } from "@pathway/platform";
import { AccessDecisionLogger } from "./access-decision-logger";
import type { AccessDecision } from "./access-decision.types";
import { EffectivePermissionsService } from "./effective-permissions.service";
import { getOrCreateRequestId } from "./request-id";
import { REQUIRED_PERMISSION } from "./require-permission.decorator";

type RequestWithDecisionMetadata = {
  headers?: Record<string, string | string[] | undefined>;
  method?: string;
  route?: { path?: string };
};

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    @Inject(Reflector)
    private readonly reflector: Reflector,
    @Inject(EffectivePermissionsService)
    private readonly permissions: EffectivePermissionsService,
    @Inject(PathwayRequestContext)
    private readonly requestContext: PathwayRequestContext,
    @Inject(AccessDecisionLogger)
    private readonly decisionLogger: AccessDecisionLogger,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const permission = this.reflector.getAllAndOverride<PermissionKey>(
      REQUIRED_PERMISSION,
      [context.getHandler(), context.getClass()],
    );

    if (!permission) {
      return true;
    }

    const metadata = requestMetadata(context);
    const requestContext = this.requestContext.getContext();
    if (!requestContext) {
      this.recordDecision(
        null,
        permission,
        { allowed: false, reason: "tenant-denied", sourceRoleIds: [] },
        metadata,
      );
      throw new ForbiddenException("Permission denied");
    }

    const decision = await this.permissions.resolve({
      userId: requestContext.user.userId,
      orgId: requestContext.org.orgId,
      tenantId: requestContext.tenant.tenantId,
      permission,
      now: new Date(),
    });

    this.recordDecision(requestContext, permission, decision, metadata);
    if (!decision.allowed) {
      throw new ForbiddenException("Permission denied");
    }

    return true;
  }

  private recordDecision(
    context: ReturnType<PathwayRequestContext["getContext"]>,
    permission: PermissionKey,
    decision: AccessDecision,
    metadata: DecisionRequestMetadata,
  ): void {
    this.decisionLogger.record({
      context: context ?? undefined,
      permission,
      decision,
      requestId: metadata.requestId,
      route: metadata.route,
    });
  }
}

interface DecisionRequestMetadata {
  requestId?: string;
  route: string;
}

function requestMetadata(context: ExecutionContext): DecisionRequestMetadata {
  const request = context
    .switchToHttp()
    .getRequest<RequestWithDecisionMetadata>();
  const routePath = request.route?.path;
  const route = routePath
    ? `${request.method ?? "UNKNOWN"} ${routePath}`
    : `${context.getClass().name}.${context.getHandler().name}`;

  return {
    requestId: getOrCreateRequestId(request),
    route,
  };
}
