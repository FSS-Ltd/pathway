import { Inject, Injectable } from "@nestjs/common";
import { assertPlatformAccessRouteAccess } from "./assert-platform-access";
import { AccessShadowService } from "./access-shadow.service";
import {
  EffectivePermissionsService,
  type EffectivePermissionWithSources,
} from "./effective-permissions.service";
import {
  ROLES_TRANSACTION_BOUNDARY,
  type RoleActorContext,
  type RolesTransactionBoundary,
} from "./roles.service";

export interface EffectivePermissionsResult {
  userId: string;
  orgId: string;
  tenantId: string | null;
  permissions: EffectivePermissionWithSources[];
}

@Injectable()
export class AccessUsersService {
  constructor(
    @Inject(ROLES_TRANSACTION_BOUNDARY)
    private readonly transaction: RolesTransactionBoundary,
    @Inject(EffectivePermissionsService)
    private readonly effectivePermissions: EffectivePermissionsService,
    @Inject(AccessShadowService)
    private readonly shadow: AccessShadowService,
  ) {}

  async getEffectivePermissions(
    targetUserId: string,
    actor: RoleActorContext,
  ): Promise<EffectivePermissionsResult> {
    await this.transaction.run(actor, (tx) =>
      assertPlatformAccessRouteAccess(
        tx,
        actor,
        "platform.access.users.read",
        "EFFECTIVE_ACCESS_API_ACCESS_DENIED",
      ),
    );

    const permissions = await this.effectivePermissions.listForUserWithSources(
      targetUserId,
      actor.orgId,
      actor.tenantId,
    );

    await this.shadow.compare({
      route: "GET /access/users/:userId/effective-permissions",
      legacyAllowed: true,
      request: {
        userId: targetUserId,
        orgId: actor.orgId,
        tenantId: actor.tenantId,
        permission: "platform.access.users.read",
        now: new Date(),
      },
    });

    return {
      userId: targetUserId,
      orgId: actor.orgId,
      tenantId: actor.tenantId ?? null,
      permissions,
    };
  }
}
