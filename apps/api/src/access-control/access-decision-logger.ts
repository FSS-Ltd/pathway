import { Injectable } from "@nestjs/common";
import type { AuthContext } from "@pathway/auth";
import type { PermissionKey } from "@pathway/platform";
import { LoggingService, type StructuredLogger } from "../common/logging/logging.service";
import type { AccessDecision } from "./access-decision.types";

export interface AccessDecisionTelemetry {
  context?: AuthContext;
  permission: PermissionKey;
  decision: AccessDecision;
  requestId?: string;
  route: string;
}

@Injectable()
export class AccessDecisionLogger {
  private readonly logger: StructuredLogger;

  constructor(logging: LoggingService) {
    this.logger = logging.createLogger(AccessDecisionLogger.name);
  }

  record({
    context,
    permission,
    decision,
    requestId,
    route,
  }: AccessDecisionTelemetry): void {
    this.logger.info("access-decision", {
      orgId: context?.org.orgId,
      tenantId: context?.tenant.tenantId,
      actorUserId: context?.user.userId,
      capability: permission,
      permission,
      decision: decision.allowed ? "allowed" : "denied",
      reason: decision.reason,
      sourceRoleIds: decision.sourceRoleIds,
      requestId,
      route,
    });
  }
}
