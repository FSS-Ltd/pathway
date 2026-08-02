import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from "@nestjs/common";
import { prisma } from "@pathway/db";
import type {
  CreateEvidenceDto,
  CreateLearningLogDto,
  CreateReportBundleDto,
  CreateSubjectDto,
} from "./dto";
import { SupabaseStorageService } from "../common/storage/supabase-storage.service";
import { reportBundleKey } from "../common/storage/storage-key.util";

const subjectSelect = {
  id: true,
  tenantId: true,
  name: true,
  category: true,
  color: true,
  isActive: true,
  sortOrder: true,
  createdAt: true,
  updatedAt: true,
} as const;

const learningLogSelect = {
  id: true,
  tenantId: true,
  childId: true,
  subjectId: true,
  activityId: true,
  loggedByUserId: true,
  activityDate: true,
  minutes: true,
  title: true,
  description: true,
  createdAt: true,
  updatedAt: true,
} as const;

const evidenceSelect = {
  id: true,
  tenantId: true,
  childId: true,
  learningLogId: true,
  title: true,
  storageKey: true,
  mimeType: true,
  byteSize: true,
  capturedAt: true,
  uploadedByUserId: true,
  createdAt: true,
} as const;

const reportBundleSelect = {
  id: true,
  tenantId: true,
  childId: true,
  requestedByUserId: true,
  periodStart: true,
  periodEnd: true,
  status: true,
  storageKey: true,
  failureReason: true,
  createdAt: true,
  completedAt: true,
} as const;

@Injectable()
export class LearningService {
  private readonly storage: SupabaseStorageService;

  constructor(
    @Optional()
    @Inject(SupabaseStorageService)
    storage?: SupabaseStorageService,
  ) {
    this.storage = storage ?? new SupabaseStorageService();
  }

  async listSubjects(tenantId: string) {
    return prisma.subject.findMany({
      where: { tenantId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: subjectSelect,
    });
  }

  async createSubject(dto: CreateSubjectDto, tenantId: string) {
    return this.create(() =>
      prisma.subject.create({
        data: {
          tenantId,
          name: dto.name,
          category: dto.category ?? null,
          color: dto.color ?? null,
          isActive: dto.isActive ?? true,
          sortOrder: dto.sortOrder ?? null,
        },
        select: subjectSelect,
      }),
    );
  }

  async listLogs(tenantId: string) {
    return prisma.learningLog.findMany({
      where: { tenantId },
      orderBy: [{ activityDate: "desc" }, { createdAt: "desc" }],
      select: learningLogSelect,
    });
  }

  async getLog(id: string, tenantId: string) {
    const log = await prisma.learningLog.findFirst({
      where: { id, tenantId },
      select: learningLogSelect,
    });
    if (!log) throw new NotFoundException("Learning log not found");
    return log;
  }

  async createLog(
    dto: CreateLearningLogDto,
    tenantId: string,
    loggedByUserId: string,
  ) {
    return this.create(() =>
      prisma.learningLog.create({
        data: {
          tenantId,
          childId: dto.childId,
          subjectId: dto.subjectId ?? null,
          activityId: dto.activityId ?? null,
          loggedByUserId,
          activityDate: dto.activityDate,
          minutes: dto.minutes ?? null,
          title: dto.title,
          description: dto.description ?? null,
        },
        select: learningLogSelect,
      }),
    );
  }

  async listEvidence(tenantId: string) {
    return prisma.evidence.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      select: evidenceSelect,
    });
  }

  async getEvidenceById(id: string, tenantId: string) {
    const evidence = await prisma.evidence.findFirst({
      where: { id, tenantId },
      select: evidenceSelect,
    });
    if (!evidence) throw new NotFoundException("Evidence not found");
    return evidence;
  }

  async createEvidence(
    dto: CreateEvidenceDto,
    tenantId: string,
    uploadedByUserId: string,
  ) {
    return this.create(() =>
      prisma.evidence.create({
        data: {
          tenantId,
          childId: dto.childId,
          learningLogId: dto.learningLogId ?? null,
          title: dto.title,
          storageKey: dto.storageKey,
          mimeType: dto.mimeType,
          byteSize: dto.byteSize,
          capturedAt: dto.capturedAt ?? null,
          uploadedByUserId,
        },
        select: evidenceSelect,
      }),
    );
  }

  async listReportBundles(tenantId: string) {
    return prisma.reportBundle.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      select: reportBundleSelect,
    });
  }

  async getReportBundle(id: string, tenantId: string) {
    const bundle = await prisma.reportBundle.findFirst({
      where: { id, tenantId },
      select: reportBundleSelect,
    });
    if (!bundle) throw new NotFoundException("Report bundle not found");
    return bundle;
  }

  /**
   * No async job/worker exists anywhere in this codebase to turn a PENDING
   * bundle into a READY one (confirmed by search before writing this) - and
   * building a real PDF-rendering pipeline is well outside this plan's
   * scope. Generates a CSV summary synchronously instead: a real, useful,
   * immediately-downloadable report from real data, rather than a bundle
   * that sits at PENDING forever. Documented as a deliberate wireframe
   * adaptation (the design says "PDF") in the build-plan ledger.
   */
  async createReportBundle(
    dto: CreateReportBundleDto,
    tenantId: string,
    requestedByUserId: string,
  ) {
    return this.create(async () => {
      const [logs, child] = await Promise.all([
        prisma.learningLog.findMany({
          where: {
            tenantId,
            childId: dto.childId,
            activityDate: { gte: dto.periodStart, lte: dto.periodEnd },
          },
          orderBy: { activityDate: "asc" },
          select: {
            activityDate: true,
            title: true,
            minutes: true,
            description: true,
            subject: { select: { name: true } },
          },
        }),
        dto.childId
          ? prisma.child.findFirst({
              where: { id: dto.childId, tenantId },
              select: { firstName: true, preferredName: true },
            })
          : null,
      ]);

      const bundle = await prisma.reportBundle.create({
        data: {
          tenantId,
          childId: dto.childId ?? null,
          requestedByUserId,
          periodStart: dto.periodStart,
          periodEnd: dto.periodEnd,
        },
        select: reportBundleSelect,
      });

      const csv = this.buildReportCsv({
        childName: child?.preferredName ?? child?.firstName ?? null,
        periodStart: dto.periodStart,
        periodEnd: dto.periodEnd,
        logs,
      });

      const key = reportBundleKey(tenantId, bundle.id);
      const uploaded = await this.storage.uploadObject({
        bucket: "private",
        key,
        body: Buffer.from(csv, "utf-8"),
        contentType: "text/csv",
      });
      if (!uploaded) {
        throw new ServiceUnavailableException(
          "Could not generate the report. Please try again.",
        );
      }

      return prisma.reportBundle.update({
        where: { id: bundle.id },
        data: { status: "READY", storageKey: key, completedAt: new Date() },
        select: reportBundleSelect,
      });
    });
  }

  private buildReportCsv(input: {
    childName: string | null;
    periodStart: Date;
    periodEnd: Date;
    logs: {
      activityDate: Date;
      title: string;
      minutes: number | null;
      description: string | null;
      subject: { name: string } | null;
    }[];
  }): string {
    const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const rows = [
      [
        `Learning report${input.childName ? ` for ${input.childName}` : ""}`,
      ],
      [
        `${input.periodStart.toISOString().slice(0, 10)} to ${input.periodEnd.toISOString().slice(0, 10)}`,
      ],
      [`${input.logs.length} learning logs`],
      [],
      ["Date", "Subject", "Title", "Minutes", "Description"],
      ...input.logs.map((log) => [
        log.activityDate.toISOString().slice(0, 10),
        log.subject?.name ?? "",
        log.title,
        log.minutes?.toString() ?? "",
        log.description ?? "",
      ]),
    ];
    return rows.map((row) => row.map(escape).join(",")).join("\n");
  }

  async getBundleFile(id: string, tenantId: string) {
    const bundle = await prisma.reportBundle.findFirst({
      where: { id, tenantId, status: "READY" },
      select: { id: true, storageKey: true },
    });
    if (!bundle?.storageKey) return null;

    const buffer = await this.storage.downloadObject(
      process.env.SUPABASE_STORAGE_PRIVATE_BUCKET ?? "",
      bundle.storageKey,
    );
    if (!buffer) return null;

    return {
      buffer,
      contentType: "text/csv",
      fileName: `${bundle.id}.csv`,
    };
  }

  private async create<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (this.isForeignKeyError(error)) {
        throw new BadRequestException("Invalid learning record reference");
      }
      if (this.isUniqueError(error)) {
        throw new BadRequestException("Learning record already exists");
      }
      throw error;
    }
  }

  private isForeignKeyError(error: unknown): boolean {
    return this.prismaCode(error) === "P2003";
  }

  private isUniqueError(error: unknown): boolean {
    return this.prismaCode(error) === "P2002";
  }

  private prismaCode(error: unknown): string | undefined {
    return typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code)
      : undefined;
  }
}
