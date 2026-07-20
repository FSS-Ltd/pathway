import { ReportBundleService } from "./report-bundle.service";

export class GenerateReportBundleJob {
  constructor(private readonly service = new ReportBundleService()) {}

  async run(bundleId: string, tenantId: string, orgId: string): Promise<void> {
    await this.service.run(bundleId, tenantId, orgId);
  }

  async runPendingForTenant(tenantId: string, orgId: string): Promise<number> {
    return this.service.runPendingForTenant(tenantId, orgId);
  }
}
