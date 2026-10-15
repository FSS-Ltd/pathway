import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { withTenantRlsContext, type Prisma } from "@pathway/db";
import { EffectivePermissionsService } from "../access-control/effective-permissions.service";
import { recordAuditEventInTransaction } from "../audit/audit.service";
import { AuditAction, AuditEntityType } from "../audit/audit.types";
import type { ComplianceActor } from "./compliance.service";
import { complianceSiteUsers } from "./compliance-queries";
export const trackerScope = (actor: ComplianceActor) => ({
  tenantId: actor.tenantId,
  orgId: actor.orgId,
});
@Injectable()
export class TrackerAccessService {
  constructor(
    @Inject(EffectivePermissionsService)
    private readonly permissions: EffectivePermissionsService,
  ) {}
  async run<T>(
    actor: ComplianceActor,
    access: "read" | "manage",
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    if (
      !actor.tenantId?.trim() ||
      !actor.orgId?.trim() ||
      !actor.userId?.trim()
    )
      throw new BadRequestException(
        "An active site and authenticated user are required",
      );
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      const site = await tx.tenant.findFirst({
        where: { id: actor.tenantId, orgId: actor.orgId },
        select: { id: true },
      });
      if (!site) throw new NotFoundException("Site not found");
      const user = await tx.user.findFirst({
        where: {
          id: actor.userId,
          isActive: true,
          ...complianceSiteUsers(actor.tenantId),
        },
        select: { id: true },
      });
      if (!user)
        throw new ForbiddenException("Active site membership is required");
      const grants = await this.permissions.listForUserWithSourcesInTransaction(
        actor.userId,
        actor.orgId,
        actor.tenantId,
        new Date(),
        tx,
      );
      if (
        !grants.some(
          (grant) => grant.permissionKey === `compliance.tracker.${access}`,
        )
      )
        throw new ForbiddenException("Compliance tracker access denied");
      return operation(tx);
    });
  }
}
export async function auditTracker(
  tx: Prisma.TransactionClient,
  actor: ComplianceActor,
  action: AuditAction,
  recordIds: string[],
): Promise<void> {
  await recordAuditEventInTransaction(tx, {
    ...actor,
    actorUserId: actor.userId,
    entityType: AuditEntityType.COMPLIANCE_TRACKER,
    action,
    entityId: recordIds.length === 1 ? recordIds[0] : undefined,
    metadata: { recordIds },
  });
}
/** Lock the existing site, including before the first profile insert. */
export async function lockTrackerSite(
  tx: Prisma.TransactionClient,
  actor: ComplianceActor,
): Promise<void> {
  const rows = await tx.$queryRaw<
    { id: string }[]
  >`SELECT "id" FROM "Tenant" WHERE "id"=${actor.tenantId} AND "orgId"=${actor.orgId} FOR UPDATE`;
  if (!rows.length) throw new NotFoundException("Site not found");
}
