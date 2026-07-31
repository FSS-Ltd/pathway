import { Inject, Injectable } from "@nestjs/common";
import { getOrgCapabilities } from "@pathway/platform";
import { EffectivePermissionsService } from "./effective-permissions.service";
import {
  resolveDelegableCeiling,
  ROLES_TRANSACTION_BOUNDARY,
  type RoleActorContext,
  type RolesTransactionBoundary,
} from "./roles.service";

@Injectable()
export class AccessPermissionsService {
  constructor(
    @Inject(ROLES_TRANSACTION_BOUNDARY)
    private readonly transaction: RolesTransactionBoundary,
    @Inject(EffectivePermissionsService)
    private readonly effectivePermissions: EffectivePermissionsService,
  ) {}

  async listDelegableKeys(actor: RoleActorContext): Promise<string[]> {
    return this.transaction.run(actor, async (tx) => {
      const [metadata, capabilities, actorPermissionKeys] = await Promise.all([
        tx.permissionDefinition.findMany({
          select: { key: true, delegable: true, isActive: true },
        }),
        getOrgCapabilities(actor.orgId, tx),
        this.effectivePermissions.listForUser(
          actor.userId,
          actor.orgId,
          actor.tenantId,
        ),
      ]);

      return resolveDelegableCeiling({
        actorPermissionKeys,
        activeCapabilities: capabilities,
        activePermissionDefinitions: metadata,
      });
    });
  }
}
