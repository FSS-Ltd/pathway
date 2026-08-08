import { ForbiddenException, Inject, Injectable, Optional, ServiceUnavailableException } from "@nestjs/common";
import { OrgRole, SiteRole, prisma } from "@pathway/db";
import archiver from "archiver";
import { SupabaseStorageService } from "../common/storage/supabase-storage.service";
import { dataExportKey } from "../common/storage/storage-key.util";
import { MailerService } from "../mailer/mailer.service";
import type { RequestDeletionDto } from "./dto";

const dataExportSelect = {
  id: true,
  tenantId: true,
  requestedById: true,
  kind: true,
  status: true,
  storageKey: true,
  createdAt: true,
  updatedAt: true,
} as const;

const deletionRequestSelect = {
  id: true,
  tenantId: true,
  requestedById: true,
  reason: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

function calculateAge(dateOfBirth: Date | null): number | null {
  if (!dateOfBirth) return null;
  const now = new Date();
  let age = now.getFullYear() - dateOfBirth.getFullYear();
  const hasHadBirthdayThisYear =
    now.getMonth() > dateOfBirth.getMonth() ||
    (now.getMonth() === dateOfBirth.getMonth() && now.getDate() >= dateOfBirth.getDate());
  if (!hasHadBirthdayThisYear) age -= 1;
  return age;
}

type LearningLogRow = {
  activityDate: Date;
  title: string;
  minutes: number | null;
  description: string | null;
  childId: string;
  subject: { name: string } | null;
};

type ReportBundleRow = {
  id: string;
  childId: string | null;
  periodStart: Date;
  periodEnd: Date;
  status: string;
  createdAt: Date;
};

type EvidenceReferenceRow = {
  id: string;
  title: string;
  childId: string;
  mimeType: string;
  byteSize: number;
  capturedAt: Date | null;
};

@Injectable()
export class PrivacyService {
  private readonly storage: SupabaseStorageService;

  constructor(
    @Optional()
    @Inject(SupabaseStorageService)
    storage: SupabaseStorageService | undefined,
    @Inject(MailerService) private readonly mailer: MailerService,
  ) {
    this.storage = storage ?? new SupabaseStorageService();
  }

  async listExports(tenantId: string) {
    return prisma.dataExportRequest.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      select: dataExportSelect,
    });
  }

  /**
   * No async job/worker exists anywhere in this codebase to advance a
   * PENDING export request to READY (same reasoning documented on
   * LearningService.createReportBundle, apps/api/src/learning/learning.service.ts:207-214)
   * - generates the zip synchronously inside this call instead. A household
   * export is larger than one CSV (children, learning logs, preferences),
   * so this is a deliberate, precedent-following tradeoff: if a real
   * household ever produces an export large enough to risk a request
   * timeout, that's a signal for a future async rework, not a reason to
   * build one speculatively now. No photos or binary evidence are
   * included - name/age/notes and text/CSV content only.
   */
  async requestExport(
    kind: "FAMILY_DATA" | "REPORT_ARCHIVE",
    tenantId: string,
    requestedById: string,
  ) {
    const request = await prisma.dataExportRequest.create({
      data: { tenantId, requestedById, kind, status: "PENDING" },
      select: dataExportSelect,
    });

    const [children, learningLogs, tenant, evidence, reportBundles] = await Promise.all([
      prisma.child.findMany({
        where: { tenantId },
        select: { id: true, firstName: true, preferredName: true, dateOfBirth: true, notes: true },
      }),
      prisma.learningLog.findMany({
        where: { tenantId },
        orderBy: { activityDate: "asc" },
        select: {
          activityDate: true,
          title: true,
          minutes: true,
          description: true,
          childId: true,
          subject: { select: { name: true } },
        },
      }),
      prisma.tenant.findUniqueOrThrow({
        where: { id: tenantId },
        select: { name: true, planningPreferences: true, notificationPreferences: true },
      }),
      // Evidence is linked by reference, never copied - same "link rather
      // than copy" rule the regulations-evidence pack export flow follows
      // (acceptance-criteria.md:62). No binary content, no storageKey -
      // just enough to know what exists and where to find it in-app.
      prisma.evidence.findMany({
        where: { tenantId },
        select: { id: true, title: true, childId: true, mimeType: true, byteSize: true, capturedAt: true },
      }),
      // Report bundle metadata only, not the generated CSV bytes - those
      // remain separately downloadable via
      // GET /learning/report-bundles/:id/download. Only fetched for
      // REPORT_ARCHIVE - FAMILY_DATA's zip doesn't claim to contain reports.
      kind === "REPORT_ARCHIVE"
        ? prisma.reportBundle.findMany({
            where: { tenantId },
            orderBy: { createdAt: "desc" },
            select: { id: true, childId: true, periodStart: true, periodEnd: true, status: true, createdAt: true },
          })
        : Promise.resolve(null),
    ]);

    const zip = await this.buildExportZip({
      kind,
      tenantName: tenant.name,
      children,
      learningLogs,
      planningPreferences: tenant.planningPreferences,
      notificationPreferences: tenant.notificationPreferences,
      evidence,
      reportBundles,
    });

    const key = dataExportKey(tenantId, request.id);
    const uploaded = await this.storage.uploadObject({
      bucket: "private",
      key,
      body: zip,
      contentType: "application/zip",
    });
    if (!uploaded) {
      throw new ServiceUnavailableException(
        "Could not generate the export. Please try again.",
      );
    }

    return prisma.dataExportRequest.update({
      where: { id: request.id },
      data: { status: "READY", storageKey: key },
      select: dataExportSelect,
    });
  }

  async getExportFile(id: string, tenantId: string) {
    const request = await prisma.dataExportRequest.findFirst({
      where: { id, tenantId, status: "READY" },
      select: { id: true, storageKey: true },
    });
    if (!request?.storageKey) return null;

    const buffer = await this.storage.downloadObject(
      process.env.SUPABASE_STORAGE_PRIVATE_BUCKET ?? "",
      request.storageKey,
    );
    if (!buffer) return null;

    return {
      buffer,
      contentType: "application/zip",
      fileName: `${request.id}.zip`,
    };
  }

  /**
   * Files a support-routed deletion request - does not delete anything.
   * "Delete family account" is more consequential than any other
   * household-config action gated by plain AuthUserGuard in this plan, so
   * it needs the same site/org-admin check TenantsController.assertSiteOrOrgAdmin
   * already uses for something less consequential (rotating a signup
   * link) - see assertSiteOrOrgAdmin below. The row is persisted before
   * the notification attempt, so (matching InvitesService.createInvite's
   * sendInviteEmail handling) a notification failure is logged, not
   * thrown - the household's request is already on record either way.
   */
  async requestDeletion(
    dto: RequestDeletionDto,
    tenantId: string,
    orgId: string,
    requestedById: string,
    requesterEmail?: string,
    requesterName?: string,
  ) {
    await this.assertSiteOrOrgAdmin(requestedById, tenantId, orgId);

    const request = await prisma.accountDeletionRequest.create({
      data: { tenantId, requestedById, reason: dto.reason ?? null },
      select: deletionRequestSelect,
    });

    try {
      await this.mailer.sendAccountDeletionRequestEmail({
        requestId: request.id,
        tenantId,
        requesterEmail,
        requesterName,
        reason: dto.reason,
      });
    } catch (error) {
      console.error(
        `[PRIVACY] Failed to notify support of deletion request ${request.id}:`,
        error,
      );
    }

    return request;
  }

  /**
   * Mirrors TenantsController.assertSiteOrOrgAdmin
   * (apps/api/src/tenants/tenants.controller.ts:141) - same three-way
   * site-admin/org-admin/legacy-org-role check, reused here rather than
   * duplicated with different rules.
   */
  private async assertSiteOrOrgAdmin(userId: string, tenantId: string, orgId: string): Promise<void> {
    const [siteMembership, orgMembership, userOrgRole] = await Promise.all([
      prisma.siteMembership.findFirst({
        where: { userId, tenantId, role: SiteRole.SITE_ADMIN },
      }),
      prisma.orgMembership.findFirst({
        where: { userId, orgId, role: OrgRole.ORG_ADMIN },
      }),
      prisma.userOrgRole.findFirst({
        where: { userId, orgId, role: OrgRole.ORG_ADMIN },
      }),
    ]);
    const canManage = siteMembership !== null || orgMembership !== null || userOrgRole !== null;
    if (!canManage) {
      throw new ForbiddenException("Only admins can request deletion of this family account");
    }
  }

  private async buildExportZip(input: {
    kind: "FAMILY_DATA" | "REPORT_ARCHIVE";
    tenantName: string;
    children: {
      id: string;
      firstName: string;
      preferredName: string | null;
      dateOfBirth: Date | null;
      notes: string | null;
    }[];
    learningLogs: LearningLogRow[];
    planningPreferences: unknown;
    notificationPreferences: unknown;
    evidence: EvidenceReferenceRow[];
    reportBundles: ReportBundleRow[] | null;
  }): Promise<Buffer> {
    const archive = archiver("zip", { zlib: { level: 9 } });
    const chunks: Buffer[] = [];
    archive.on("data", (chunk) => chunks.push(chunk));
    const done = new Promise<void>((resolve, reject) => {
      archive.on("end", () => resolve());
      archive.on("error", reject);
    });

    archive.append(
      JSON.stringify(
        {
          kind: input.kind,
          household: input.tenantName,
          generatedAt: new Date().toISOString(),
          contents: [
            "manifest.json",
            "children.json",
            "learning-logs.csv",
            "preferences.json",
            "evidence.json",
            ...(input.reportBundles ? ["report-bundles.json"] : []),
          ],
        },
        null,
        2,
      ),
      { name: "manifest.json" },
    );

    archive.append(
      JSON.stringify(
        input.children.map((child) => ({
          id: child.id,
          name: child.preferredName || child.firstName,
          age: calculateAge(child.dateOfBirth),
          notes: child.notes ?? null,
        })),
        null,
        2,
      ),
      { name: "children.json" },
    );

    const childNameById = new Map(
      input.children.map((child) => [child.id, child.preferredName || child.firstName]),
    );
    archive.append(this.buildLearningLogsCsv(input.learningLogs, childNameById), {
      name: "learning-logs.csv",
    });

    archive.append(
      JSON.stringify(
        {
          planningPreferences: input.planningPreferences,
          notificationPreferences: input.notificationPreferences,
        },
        null,
        2,
      ),
      { name: "preferences.json" },
    );

    // References only, never copies - see the "link rather than copy"
    // comment on the evidence.findMany call above.
    archive.append(
      JSON.stringify(
        input.evidence.map((item) => ({
          id: item.id,
          title: item.title,
          childId: item.childId,
          mimeType: item.mimeType,
          byteSize: item.byteSize,
          capturedAt: item.capturedAt ? item.capturedAt.toISOString() : null,
        })),
        null,
        2,
      ),
      { name: "evidence.json" },
    );

    if (input.reportBundles) {
      archive.append(
        JSON.stringify(
          input.reportBundles.map((bundle) => ({
            id: bundle.id,
            childId: bundle.childId,
            periodStart: bundle.periodStart.toISOString(),
            periodEnd: bundle.periodEnd.toISOString(),
            status: bundle.status,
            createdAt: bundle.createdAt.toISOString(),
          })),
          null,
          2,
        ),
        { name: "report-bundles.json" },
      );
    }

    await archive.finalize();
    await done;
    return Buffer.concat(chunks);
  }

  private buildLearningLogsCsv(logs: LearningLogRow[], childNameById: Map<string, string>): string {
    const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const rows = [
      ["Date", "Child", "Subject", "Title", "Minutes", "Description"],
      ...logs.map((log) => [
        log.activityDate.toISOString().slice(0, 10),
        childNameById.get(log.childId) ?? log.childId,
        log.subject?.name ?? "",
        log.title,
        log.minutes?.toString() ?? "",
        log.description ?? "",
      ]),
    ];
    return rows.map((row) => row.map(escape).join(",")).join("\n");
  }
}
