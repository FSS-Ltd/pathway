import { Inject, Injectable } from "@nestjs/common";
import { getOrgCapabilities } from "@pathway/platform";
import { assertPlatformAccessRouteAccess } from "./assert-platform-access";
import {
  resolveTemporaryRoleApiBootstrap,
  ROLES_TRANSACTION_BOUNDARY,
  type RoleActorContext,
  type RolesTransactionBoundary,
} from "./roles.service";

@Injectable()
export class AccessPermissionsService {
  constructor(
    @Inject(ROLES_TRANSACTION_BOUNDARY)
    private readonly transaction: RolesTransactionBoundary,
  ) {}

  async listDelegableKeys(actor: RoleActorContext): Promise<string[]> {
    return this.transaction.run(actor, async (tx) => {
      await assertPlatformAccessRouteAccess(
        tx,
        actor,
        "platform.access.permissions.read",
        "PERMISSIONS_API_ACCESS_DENIED",
      );

      const [metadata, capabilities] = await Promise.all([
        tx.permissionDefinition.findMany({
          select: { key: true, delegable: true, isActive: true },
        }),
        getOrgCapabilities(actor.orgId, tx),
      ]);

      return resolveTemporaryRoleApiBootstrap({
        ...actor,
        activeCapabilities: capabilities,
        activePermissionDefinitions: metadata,
      });
    });
  }
}
