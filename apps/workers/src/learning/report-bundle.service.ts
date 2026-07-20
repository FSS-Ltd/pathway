import { prisma, withTenantRlsContext } from "@pathway/db";
import {
  type ReportBundleStorage,
  SupabaseReportBundleStorage,
} from "./storage-upload";

export type ReportBundleWorkerClient = Pick<
  typeof prisma,
  "reportBundle" | "learningLog"
>;

export type { ReportBundleStorage } from "./storage-upload";

export class ReportBundleService {
  constructor(
    private readonly client: ReportBundleWorkerClient = prisma,
    private readonly storage: ReportBundleStorage = new SupabaseReportBundleStorage(),
  ) {}

  async run(bundleId: string, tenantId: string, orgId: string): Promise<void> {
    let generationStarted = false;
    try {
      const bundle = await withTenantRlsContext(tenantId, orgId, async () => {
        const pending = await this.client.reportBundle.findFirst({
          where: { id: bundleId, tenantId, status: "PENDING" },
          select: {
            id: true,
            tenantId: true,
            childId: true,
            periodStart: true,
            periodEnd: true,
          },
        });
        if (!pending) {
          throw new Error("Pending report bundle not found");
        }
        const transition = await this.client.reportBundle.updateMany({
          where: { id: pending.id, tenantId, status: "PENDING" },
          data: { status: "GENERATING", failureReason: null },
        });
        if (transition.count !== 1) {
          throw new Error("Report bundle is no longer pending");
        }
        generationStarted = true;
        return pending;
      });

      const logs = await withTenantRlsContext(tenantId, orgId, () =>
        this.client.learningLog.findMany({
          where: {
            tenantId,
            ...(bundle.childId ? { childId: bundle.childId } : {}),
            activityDate: { gte: bundle.periodStart, lte: bundle.periodEnd },
          },
          orderBy: [{ activityDate: "asc" }, { createdAt: "asc" }],
          select: {
            id: true,
            activityDate: true,
            title: true,
            minutes: true,
            description: true,
            child: { select: { firstName: true, lastName: true } },
            subject: { select: { name: true } },
          },
        }),
      );

      const inRangeLogs = logs.filter(
        (log) =>
          log.activityDate >= bundle.periodStart &&
          log.activityDate <= bundle.periodEnd,
      );
      const key = reportBundleKey(tenantId, bundle.id);
      await this.storage.uploadCsv(key, toCsv(inRangeLogs));

      const completed = await withTenantRlsContext(tenantId, orgId, () =>
        this.client.reportBundle.updateMany({
          where: { id: bundle.id, tenantId, status: "GENERATING" },
          data: {
            status: "READY",
            storageKey: key,
            completedAt: new Date(),
            failureReason: null,
          },
        }),
      );
      if (completed.count !== 1) {
        throw new Error("Report bundle status changed before completion");
      }
    } catch (error) {
      if (generationStarted) {
        await withTenantRlsContext(tenantId, orgId, () =>
          this.client.reportBundle.updateMany({
            where: { id: bundleId, tenantId, status: "GENERATING" },
            data: { status: "FAILED", failureReason: errorMessage(error) },
          }),
        ).catch(() => undefined);
      }
      throw error;
    }
  }

  async runPendingForTenant(tenantId: string, orgId: string): Promise<number> {
    const pendingBundles = await withTenantRlsContext(tenantId, orgId, () =>
      this.client.reportBundle.findMany({
        where: { tenantId, status: "PENDING" },
        select: { id: true },
        orderBy: { createdAt: "asc" },
      }),
    );

    for (const bundle of pendingBundles) {
      await this.run(bundle.id, tenantId, orgId);
    }
    return pendingBundles.length;
  }
}

export function reportBundleKey(tenantId: string, bundleId: string): string {
  return `tenants/${tenantId}/reports/${bundleId}/bundle.csv`;
}

function toCsv(
  logs: Array<{
    activityDate: Date;
    title: string;
    minutes: number | null;
    description: string | null;
    child: { firstName: string; lastName: string };
    subject: { name: string } | null;
  }>,
): string {
  const header = "activityDate,child,subject,title,minutes,description";
  const rows = logs.map((log) =>
    [
      log.activityDate.toISOString().slice(0, 10),
      `${log.child.firstName} ${log.child.lastName}`,
      log.subject?.name ?? "",
      log.title,
      log.minutes?.toString() ?? "",
      log.description ?? "",
    ]
      .map(csvValue)
      .join(","),
  );
  return `${header}\n${rows.join("\n")}${rows.length ? "\n" : ""}`;
}

function csvValue(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 1_000) : "Unknown failure";
}
