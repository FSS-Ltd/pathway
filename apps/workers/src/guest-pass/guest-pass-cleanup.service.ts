import { prisma, withTenantRlsContext } from "@pathway/db";

type DeleteMany = (args?: unknown) => Promise<{ count: number }>;

export type GuestPassCleanupPrismaClient = {
  tenant: {
    findMany: (args?: unknown) => Promise<Array<{ id: string; orgId: string }>>;
  };
  child: { deleteMany: (args?: unknown) => Promise<{ count: number }> };
};

const guestPassCleanupPrisma: GuestPassCleanupPrismaClient = {
  tenant: {
    findMany: (args) =>
      prisma.tenant.findMany(
        args as Parameters<typeof prisma.tenant.findMany>[0],
      ),
  },
  child: {
    deleteMany: (args) =>
      (prisma as unknown as Record<string, { deleteMany: DeleteMany }>).child
        .deleteMany(args as unknown),
  },
};

/**
 * Hard-deletes expired guest-pass children. Cascade removes ChildGuardianContact,
 * Attendance, ChildNote, Concern rows for that child. See docs/design/guest-pass-24h.md.
 * The read-time filter in ChildrenService already hides these before this runs;
 * this is the physical-deletion guarantee, run hourly (not nightly, unlike RetentionService).
 */
export class GuestPassCleanupService {
  constructor(
    private readonly client: GuestPassCleanupPrismaClient = guestPassCleanupPrisma,
  ) {}

  async run(now: Date = new Date()): Promise<void> {
    if (process.env.GUEST_CLEANUP_ENABLED !== "true") {
      console.info(
        "[GuestPassCleanup] Skipped; GUEST_CLEANUP_ENABLED is not true. No data modified.",
      );
      return;
    }

    const tenants = await this.client.tenant.findMany({
      select: { id: true, orgId: true },
    });

    for (const tenant of tenants) {
      await withTenantRlsContext(tenant.id, tenant.orgId, async (tx) => {
        const childDelegate = (tx as unknown as Record<string, { deleteMany: DeleteMany }>)
          .child;
        const result = await childDelegate.deleteMany({
          where: { isGuest: true, guestExpiresAt: { lt: now } },
        });

        console.info("[GuestPassCleanup] Org processed", {
          orgId: tenant.orgId,
          tenantId: tenant.id,
          guestChildrenDeleted: result.count,
        });
      });
    }
  }
}
