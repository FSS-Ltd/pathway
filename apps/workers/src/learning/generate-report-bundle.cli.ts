import "dotenv/config";
import { closePrisma, prisma, withTenantRlsContext } from "@pathway/db";
import { GenerateReportBundleJob } from "./generate-report-bundle.job";

async function main() {
  const bundleId = process.env.REPORT_BUNDLE_ID?.trim();
  const tenantId = process.env.REPORT_BUNDLE_TENANT_ID?.trim();
  const orgId = process.env.REPORT_BUNDLE_ORG_ID?.trim();
  if (bundleId && tenantId && orgId) {
    await new GenerateReportBundleJob().run(bundleId, tenantId, orgId);
    console.log(
      `[report-bundle] Generated bundle ${bundleId} for tenant ${tenantId}.`,
    );
    return;
  }

  const tenantIds = (process.env.REPORT_BUNDLE_TENANT_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (!tenantIds.length) {
    console.log("[report-bundle] No report bundle input configured; skipping.");
    return;
  }

  const job = new GenerateReportBundleJob();
  for (const configuredTenantId of tenantIds) {
    const tenant = await withTenantRlsContext(
      configuredTenantId,
      null,
      () =>
        prisma.tenant.findUnique({
          where: { id: configuredTenantId },
          select: { id: true, orgId: true },
        }),
    );
    if (!tenant) {
      throw new Error(`Tenant ${configuredTenantId} is not accessible`);
    }
    const generated = await job.runPendingForTenant(tenant.id, tenant.orgId);
    console.log(
      `[report-bundle] Generated ${generated} pending bundle(s) for tenant ${tenant.id}.`,
    );
  }
}

main()
  .catch((error) => {
    console.error("[report-bundle] generation failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePrisma().catch(() => undefined);
  });
