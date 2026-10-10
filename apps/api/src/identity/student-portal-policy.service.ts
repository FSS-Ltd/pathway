import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { withTenantRlsContext, type Prisma } from "@pathway/db";
import { recordAuditEventInTransaction } from "../audit/audit.service";
import { AuditAction, AuditEntityType } from "../audit/audit.types";

export async function requireAceStudentSite(
  tx: Prisma.TransactionClient,
  tenantId: string,
  orgId: string,
): Promise<void> {
  const site = await tx.tenant.findFirst({
    where: { id: tenantId, orgId },
    select: {
      org: { select: { orgVertical: { select: { vertical: true } } } },
    },
  });
  if (!site || site.org.orgVertical?.vertical !== "ACE_SCHOOL") {
    throw new NotFoundException("Student portal site not found");
  }
}

export async function requireEnabledStudentPortal(
  tx: Prisma.TransactionClient,
  tenantId: string,
): Promise<void> {
  const policy = await tx.studentPortalPolicy.findUnique({
    where: { tenantId },
    select: { studentPortalEnabled: true },
  });
  if (!policy?.studentPortalEnabled) {
    throw new ConflictException("Student portal is not enabled for this site");
  }
}

@Injectable()
export class StudentPortalPolicyService {
  async get(tenantId: string, orgId: string): Promise<{ enabled: boolean }> {
    return withTenantRlsContext(tenantId, orgId, async (tx) => {
      await requireAceStudentSite(tx, tenantId, orgId);
      const policy = await tx.studentPortalPolicy.findUnique({
        where: { tenantId },
        select: { studentPortalEnabled: true },
      });
      return { enabled: policy?.studentPortalEnabled ?? false };
    });
  }

  async set(
    tenantId: string,
    orgId: string,
    actorUserId: string,
    enabled: boolean,
  ): Promise<{ enabled: boolean }> {
    return withTenantRlsContext(tenantId, orgId, async (tx) => {
      await requireAceStudentSite(tx, tenantId, orgId);
      const current = await tx.studentPortalPolicy.findUnique({
        where: { tenantId },
        select: { studentPortalEnabled: true },
      });
      if (current?.studentPortalEnabled === enabled) return { enabled };
      await tx.studentPortalPolicy.upsert({
        where: { tenantId },
        create: { tenantId, studentPortalEnabled: enabled },
        update: { studentPortalEnabled: enabled },
      });
      await recordAuditEventInTransaction(tx, {
        actorUserId,
        tenantId,
        orgId,
        entityType: AuditEntityType.ACE_RECORD,
        entityId: tenantId,
        action: current ? AuditAction.UPDATED : AuditAction.CREATED,
        metadata: { kind: "STUDENT_PORTAL_POLICY", enabled: String(enabled) },
      });
      return { enabled };
    });
  }
}
