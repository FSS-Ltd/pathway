import { BadRequestException, Inject, Injectable, Optional } from "@nestjs/common";
import { prisma } from "@pathway/db";
import type {
  CreateEvidenceDto,
  CreateLearningLogDto,
  CreateReportBundleDto,
  CreateSubjectDto,
} from "./dto";
import { SupabaseStorageService } from "../common/storage/supabase-storage.service";

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

  async createReportBundle(
    dto: CreateReportBundleDto,
    tenantId: string,
    requestedByUserId: string,
  ) {
    return this.create(() =>
      prisma.reportBundle.create({
        data: {
          tenantId,
          childId: dto.childId ?? null,
          requestedByUserId,
          periodStart: dto.periodStart,
          periodEnd: dto.periodEnd,
        },
        select: reportBundleSelect,
      }),
    );
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
