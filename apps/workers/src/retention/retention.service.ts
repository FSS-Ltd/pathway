import { AuditEntityType, prisma, withTenantRlsContext } from "@pathway/db";
import { RetentionConfigService } from "./retention-config.service";

// Preserve Finance evidence until its owner-approved retention policy exists.
const financeAuditEntityTypes: ReadonlySet<AuditEntityType> = new Set([
  AuditEntityType.FINANCE_REPORT,
  AuditEntityType.FINANCE_PAYER_ACCOUNT,
]);

type DeleteMany = (args?: unknown) => Promise<{ count: number }>;

export type RetentionPrismaClient = {
  tenant: {
    findMany: (args?: unknown) => Promise<Array<{ id: string; orgId: string }>>;
  };
  staffActivity: { deleteMany: (args?: unknown) => Promise<{ count: number }> };
  attendance: { deleteMany: (args?: unknown) => Promise<{ count: number }> };
  auditEvent: { deleteMany: (args?: unknown) => Promise<{ count: number }> };
};

const retentionPrisma: RetentionPrismaClient = {
  tenant: {
    findMany: (args) =>
      prisma.tenant.findMany(
        args as Parameters<typeof prisma.tenant.findMany>[0],
      ),
  },
  staffActivity: {
    deleteMany: (args) =>
      (
        prisma as unknown as Record<string, { deleteMany: DeleteMany }>
      ).staffActivity.deleteMany(args as unknown),
  },
  attendance: {
    deleteMany: (args) =>
      (
        prisma as unknown as Record<string, { deleteMany: DeleteMany }>
      ).attendance.deleteMany(args as unknown),
  },
  auditEvent: {
    deleteMany: (args) =>
      (
        prisma as unknown as Record<string, { deleteMany: DeleteMany }>
      ).auditEvent.deleteMany(args as unknown),
  },
};

export class RetentionService {
  constructor(
    private readonly config = new RetentionConfigService(),
    private readonly client: RetentionPrismaClient = retentionPrisma,
  ) {}

  async run(now: Date = new Date()): Promise<void> {
    if (process.env.RETENTION_ENABLED !== "true") {
      console.info(
        "[Retention] Skipped; RETENTION_ENABLED is not true. No data modified.",
      );
      return;
    }

    const tenants = await this.client.tenant.findMany({
      select: { id: true, orgId: true },
    });

    for (const tenant of tenants) {
      const policy = await this.config.resolveForOrg(tenant.orgId);
      await withTenantRlsContext(tenant.id, tenant.orgId, async (tx) => {
        const attendanceCutoff = new Date(
          now.getTime() - policy.attendanceRetentionDays * 24 * 60 * 60 * 1000,
        );
        const staffActivityCutoff = new Date(
          now.getTime() -
            policy.staffActivityRetentionDays * 24 * 60 * 60 * 1000,
        );
        const auditEventCutoff = new Date(
          now.getTime() - policy.auditEventRetentionDays * 24 * 60 * 60 * 1000,
        );

        // Least sensitive: staff activity - hard delete old rows
        const delegates = tx as unknown as Record<string, unknown>;
        const staffActivityDelegate = delegates["staffActivity"] as {
          deleteMany: DeleteMany;
        };
        const staffActivityResult = await staffActivityDelegate.deleteMany({
          where: { occurredAt: { lt: staffActivityCutoff } },
        });

        // Attendance: soft-delete not available; hard delete older rows for now with TODO for anonymisation
        const attendanceDelegate = delegates["attendance"] as {
          deleteMany: DeleteMany;
        };
        const attendanceResult = await attendanceDelegate.deleteMany({
          where: { timestamp: { lt: attendanceCutoff } },
        });

        // Audit events: hard delete older rows (consider export/archive later)
        const auditDelegate = delegates["auditEvent"] as {
          deleteMany: DeleteMany;
        };
        const auditResult = await auditDelegate.deleteMany({
          where: {
            tenantId: tenant.id,
            orgId: tenant.orgId,
            createdAt: { lt: auditEventCutoff },
            entityType: { notIn: [...financeAuditEntityTypes] },
          },
        });

        console.info("[Retention] Org processed", {
          orgId: tenant.orgId,
          tenantId: tenant.id,
          attendanceDeleted: attendanceResult.count,
          staffActivityDeleted: staffActivityResult.count,
          auditEventsDeleted: auditResult.count,
          // TODO(Epic7): add anonymisation for safeguarding tables (Concern, ChildNote) after legal review
        });
      });
    }
  }
}
