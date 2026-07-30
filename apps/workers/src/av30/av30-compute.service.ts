import { prisma, withTenantRlsContext, Prisma } from "@pathway/db";

export interface TenantOrgContext {
  tenantId: string;
  orgId: string;
}

export interface Av30ComputationResult {
  orgId: string;
  av30: number;
  calculatedAt: Date;
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export class Av30ComputeService {
  constructor(private readonly client = prisma) {}

  /**
   * Resolve tenant/org contexts for a set of tenant IDs while respecting RLS.
   */
  async resolveTenantContexts(
    tenantIds: string[],
  ): Promise<TenantOrgContext[]> {
    const contexts: TenantOrgContext[] = [];

    for (const tenantId of tenantIds) {
      const tenant = await withTenantRlsContext(tenantId, null, (tx) =>
        tx.tenant.findUnique({
          where: { id: tenantId },
          select: { id: true, orgId: true },
        }),
      );

      if (!tenant) {
        throw new Error(
          `Tenant ${tenantId} is not accessible or does not exist for AV30 computation`,
        );
      }

      contexts.push({ tenantId: tenant.id, orgId: tenant.orgId });
    }

    return contexts;
  }

  /**
   * Compute AV30 per org across the provided tenant contexts and persist to UsageCounters.
   */
  async computeForTenants(
    contexts: TenantOrgContext[],
    now: Date = new Date(),
  ): Promise<Av30ComputationResult[]> {
    if (!contexts.length) {
      return [];
    }

    const uniqueContexts = new Map<string, TenantOrgContext>();
    for (const ctx of contexts) {
      if (!uniqueContexts.has(ctx.tenantId)) {
        uniqueContexts.set(ctx.tenantId, ctx);
      }
    }

    const windowStart = new Date(now.getTime() - THIRTY_DAYS_MS);
    const orgToStaff = new Map<string, Set<string>>();

    for (const ctx of uniqueContexts.values()) {
      await withTenantRlsContext(ctx.tenantId, ctx.orgId, async (tx) => {
        const staffSet = orgToStaff.get(ctx.orgId) ?? new Set<string>();
        type StaffActivityClient = {
          findMany: (args: {
            where: {
              tenantId: string;
              orgId: string;
              occurredAt: { gte: Date };
            };
            select: { staffUserId: boolean };
            distinct?: string[];
          }) => Promise<Array<{ staffUserId: string }>>;
        };
        type TxWithStaff = Prisma.TransactionClient & {
          staffActivity: StaffActivityClient;
        };
        const client = tx as TxWithStaff;
        const staff = await client.staffActivity.findMany({
          where: {
            tenantId: ctx.tenantId,
            orgId: ctx.orgId,
            occurredAt: { gte: windowStart },
          },
          select: { staffUserId: true },
          distinct: ["staffUserId"],
        });

        for (const row of staff) {
          staffSet.add(row.staffUserId);
        }

        // Ensure we still persist zero-count entries for orgs with no activity.
        orgToStaff.set(ctx.orgId, staffSet);
      });
    }

    const results: Av30ComputationResult[] = [];

    for (const [orgId, staffIds] of orgToStaff.entries()) {
      const av30 = staffIds.size;
      const calculatedAt = now;

      const existing = await this.client.usageCounters.findFirst({
        where: { orgId },
        orderBy: { calculatedAt: "desc" },
      });

      if (existing) {
        await this.client.usageCounters.update({
          where: { id: existing.id },
          data: { av30, calculatedAt },
        });
      } else {
        await this.client.usageCounters.create({
          data: { orgId, av30, calculatedAt },
        });
      }

      results.push({ orgId, av30, calculatedAt });
    }

    return results;
  }
}
