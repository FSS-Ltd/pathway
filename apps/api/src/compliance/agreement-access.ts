import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { withTenantRlsContext, type Prisma } from "@pathway/db";
import { getOrgCapabilities } from "@pathway/platform";
import { EffectivePermissionsService } from "../access-control/effective-permissions.service";
import { recordAuditEventInTransaction } from "../audit/audit.service";
import { AuditAction, AuditEntityType } from "../audit/audit.types";
import type { ComplianceActor } from "./compliance.service";
import { complianceSiteUsers } from "./compliance-queries";
import { adultUserSelect, userAgeStatus } from "./agreement-eligibility";
export const agreementScope = (actor: ComplianceActor) => ({
  tenantId: actor.tenantId,
  orgId: actor.orgId,
});
export type AgreementAccess = "own" | "read" | "manage";
@Injectable()
export class AgreementAccessService {
  constructor(
    @Inject(EffectivePermissionsService)
    private readonly permissions: EffectivePermissionsService,
  ) {}
  async canRead(actor: ComplianceActor): Promise<boolean> {
    return (
      await this.permissions.resolve({
        ...actor,
        permission: "compliance.agreements.read",
        now: new Date(),
      })
    ).allowed;
  }
  async run<T>(
    actor: ComplianceActor,
    access: AgreementAccess,
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
      if (access === "own") {
        const capabilities = await getOrgCapabilities(actor.orgId, tx);
        if (!capabilities.includes("compliance.agreements.read"))
          throw new ForbiddenException(
            "Institutional agreements are unavailable",
          );
      } else {
        const grants =
          await this.permissions.listForUserWithSourcesInTransaction(
            actor.userId,
            actor.orgId,
            actor.tenantId,
            new Date(),
            tx,
          );
        if (
          !grants.some(
            (grant) =>
              grant.permissionKey ===
              (access === "manage"
                ? "compliance.agreements.manage"
                : "compliance.agreements.read"),
          )
        )
          throw new ForbiddenException("Agreement access denied");
      }
      return operation(tx);
    });
  }
}
export async function eligibleRecipient(
  tx: Prisma.TransactionClient,
  actor: ComplianceActor,
  id: string,
): Promise<void> {
  const user = await tx.user.findFirst({
    where: { id, isActive: true, ...complianceSiteUsers(actor.tenantId) },
    select: adultUserSelect(actor.tenantId),
  });
  if (!user || userAgeStatus(user) === "MINOR")
    throw new BadRequestException(
      "The recipient must be an active adult at this site",
    );
}
export async function lockAgreement(
  tx: Prisma.TransactionClient,
  actor: ComplianceActor,
  id: string,
): Promise<void> {
  const rows = await tx.$queryRaw<
    { id: string }[]
  >`SELECT "id" FROM "ComplianceAgreementDocument" WHERE "id" = ${id} AND "tenantId" = ${actor.tenantId} AND "orgId" = ${actor.orgId} FOR UPDATE`;
  if (!rows.length) throw new NotFoundException("Agreement not found");
}
export async function auditAgreement(
  tx: Prisma.TransactionClient,
  actor: ComplianceActor,
  action: AuditAction,
  recordIds: string[],
): Promise<void> {
  await recordAuditEventInTransaction(tx, {
    ...actor,
    actorUserId: actor.userId,
    entityType: AuditEntityType.COMPLIANCE_AGREEMENT,
    action,
    entityId: recordIds.length === 1 ? recordIds[0] : undefined,
    metadata: { recordIds },
  });
}
