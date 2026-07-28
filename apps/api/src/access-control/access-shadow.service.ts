import type { PermissionKey } from "@pathway/platform";
import type { StructuredLogger } from "../common/logging/logging.service";
import type {
  AccessDecision,
  EffectiveAccessRequest,
} from "./access-decision.types";
import { EffectivePermissionsService } from "./effective-permissions.service";

export interface AccessShadowDrift {
  route: string;
  legacyAllowed: boolean;
  permissionAllowed: boolean;
  permission: PermissionKey;
  reason: AccessDecision["reason"];
}

export interface AccessShadowAllowListEntry {
  route: string;
  permission: PermissionKey;
}

export interface AccessShadowConfig {
  enabled: boolean;
  allowList: readonly AccessShadowAllowListEntry[];
}

export interface AccessShadowComparison {
  route: string;
  legacyAllowed: boolean;
  request: EffectiveAccessRequest;
}

export const ACCESS_SHADOW_ALLOW_LIST = [
  {
    route: "GET /access/users/:userId/effective-permissions",
    permission: "platform.access.users.read",
  },
] as const satisfies readonly AccessShadowAllowListEntry[];

export function accessShadowConfigFromEnvironment(): AccessShadowConfig {
  return {
    enabled: process.env.ACE_ACCESS_SHADOW_ENABLED === "true",
    allowList: ACCESS_SHADOW_ALLOW_LIST,
  };
}

export class AccessShadowService {
  constructor(
    private readonly permissions: EffectivePermissionsService,
    private readonly logger: StructuredLogger,
    private readonly config: AccessShadowConfig,
  ) {}

  async compare({
    route,
    legacyAllowed,
    request,
  }: AccessShadowComparison): Promise<boolean> {
    if (!this.shouldCompare(route, request.permission)) {
      return legacyAllowed;
    }

    try {
      const decision = await this.permissions.resolve(request);
      if (decision.allowed !== legacyAllowed) {
        this.recordDrift({
          route,
          legacyAllowed,
          permissionAllowed: decision.allowed,
          permission: request.permission,
          reason: decision.reason,
        });
      }
    } catch {
      this.logger.warn("access-shadow-evaluation-error", {
        route,
        permission: request.permission,
      });
    }

    return legacyAllowed;
  }

  private shouldCompare(route: string, permission: PermissionKey): boolean {
    return (
      this.config.enabled &&
      this.config.allowList.some(
        (entry) => entry.route === route && entry.permission === permission,
      )
    );
  }

  private recordDrift(drift: AccessShadowDrift): void {
    this.logger.info("access-shadow-drift", {
      route: drift.route,
      legacyAllowed: drift.legacyAllowed,
      permissionAllowed: drift.permissionAllowed,
      permission: drift.permission,
      reason: drift.reason,
    });
  }
}
