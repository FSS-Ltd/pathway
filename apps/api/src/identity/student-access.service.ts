import { Injectable, NotFoundException } from "@nestjs/common";
import { withTenantRlsContext } from "@pathway/db";
import { recordAuditEventInTransaction } from "../audit/audit.service";
import { AuditAction, AuditEntityType } from "../audit/audit.types";
import { lockFamilyInvite } from "./family-invite-operations";
import { requireAceStudentSite } from "./student-portal-policy.service";

@Injectable()
export class StudentAccessService {
  async get(tenantId: string, orgId: string, childId: string) {
    return withTenantRlsContext(tenantId, orgId, async (tx) => {
      await requireAceStudentSite(tx, tenantId, orgId);
      const child = await tx.child.findFirst({
        where: { id: childId, tenantId },
        select: { id: true },
      });
      if (!child) throw new NotFoundException("Child not found");
      const link = await tx.studentIdentityLink.findFirst({
        where: { tenantId, childId, endedAt: null, revokedAt: null },
        select: {
          id: true,
          linkedAt: true,
          studentIdentity: { select: { user: { select: { email: true } } } },
        },
      });
      return {
        active: link
          ? {
              id: link.id,
              email: link.studentIdentity.user.email,
              linkedAt: link.linkedAt,
            }
          : null,
      };
    });
  }

  async revoke(
    tenantId: string,
    orgId: string,
    actorUserId: string,
    childId: string,
    reason: string,
  ): Promise<{ id: string; revokedAt: Date }> {
    return withTenantRlsContext(tenantId, orgId, async (tx) => {
      await lockFamilyInvite(tx, tenantId, childId);
      await requireAceStudentSite(tx, tenantId, orgId);
      const link = await tx.studentIdentityLink.findFirst({
        where: { tenantId, childId, endedAt: null, revokedAt: null },
        select: { id: true },
      });
      if (!link) throw new NotFoundException("Active student access not found");
      const revokedAt = new Date();
      await tx.studentIdentityLink.update({
        where: { id: link.id },
        data: {
          revokedAt,
          revokedByUserId: actorUserId,
          revocationReason: reason,
        },
      });
      await recordAuditEventInTransaction(tx, {
        actorUserId,
        tenantId,
        orgId,
        entityType: AuditEntityType.ACE_RECORD,
        entityId: link.id,
        action: AuditAction.UPDATED,
        metadata: {
          kind: "STUDENT_ACCESS_REVOKED",
          childId,
          revokedAt: revokedAt.toISOString(),
        },
      });
      return { id: link.id, revokedAt };
    });
  }
}
