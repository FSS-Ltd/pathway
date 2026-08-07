import { Inject, Injectable, Optional, ServiceUnavailableException } from "@nestjs/common";
import { prisma } from "@pathway/db";
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

    const [children, learningLogs, tenant] = await Promise.all([
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
    ]);

    const zip = await this.buildExportZip({
      kind,
      tenantName: tenant.name,
      children,
      learningLogs,
      planningPreferences: tenant.planningPreferences,
      notificationPreferences: tenant.notificationPreferences,
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
   * The row is persisted before the notification attempt, so (matching
   * InvitesService.createInvite's sendInviteEmail handling) a notification
   * failure is logged, not thrown - the household's request is already on
   * record either way.
   */
  async requestDeletion(
    dto: RequestDeletionDto,
    tenantId: string,
    requestedById: string,
    requesterEmail?: string,
    requesterName?: string,
  ) {
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
