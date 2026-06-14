import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { prisma } from "@pathway/db";
import type { Prisma } from "@pathway/db";
import { CreateLessonDto, UpdateLessonDto, decodeResourceFile } from "./dto";
import { SupabaseStorageService } from "../common/storage/supabase-storage.service";
import { lessonResourceKey } from "../common/storage/storage-key.util";

@Injectable()
export class LessonsService {
  constructor(@Optional() storage?: SupabaseStorageService) {
    this.storage = storage ?? new SupabaseStorageService();
  }

  private readonly storage: SupabaseStorageService;

  /** Create a lesson. Validates tenant and (optional) group ownership. */
  async create(dto: CreateLessonDto, tenantId: string) {
    if (dto.tenantId !== tenantId) {
      throw new BadRequestException("tenantId must match current tenant");
    }
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true },
    });
    if (!tenant) throw new NotFoundException("Tenant not found");

    if (dto.groupId) {
      const group = await prisma.group.findUnique({
        where: { id: dto.groupId },
        select: { id: true, tenantId: true },
      });
      if (!group) throw new NotFoundException("Group not found");
      if (group.tenantId !== tenantId) {
        throw new BadRequestException("Group must belong to the same tenant");
      }
    }

    if (dto.sessionId) {
      const session = await prisma.session.findUnique({
        where: { id: dto.sessionId },
        select: { id: true, tenantId: true },
      });
      if (!session) throw new NotFoundException("Session not found");
      if (session.tenantId !== tenantId) {
        throw new BadRequestException("Session must belong to the same tenant");
      }
    }

    let resourceFileBytes: Buffer | null = null;
    let resourceFileName: string | null = null;
    try {
      const decoded = decodeResourceFile(
        dto.resourceFileBase64,
        dto.resourceFileName,
      );
      if (decoded) {
        resourceFileBytes = decoded.buffer;
        resourceFileName = decoded.fileName;
      }
    } catch (e) {
      throw new BadRequestException(
        e instanceof Error ? e.message : "Invalid resource file",
      );
    }

    try {
      const lesson = await prisma.lesson.create({
        data: {
          tenantId,
          groupId: dto.groupId ?? null,
          sessionId: dto.sessionId ?? null,
          title: dto.title,
          description: dto.description ?? null,
          fileKey: dto.fileKey ?? resourceFileName ?? null,
          weekOf: dto.weekOf,
          resourceFileBytes,
          resourceFileName,
        },
      });

      if (
        resourceFileBytes &&
        resourceFileName &&
        this.storage.isConfigured()
      ) {
        const stored = await this.storage.uploadObject({
          bucket: "private",
          key: lessonResourceKey(tenantId, lesson.id, resourceFileName),
          body: resourceFileBytes,
          contentType: "application/octet-stream",
        });
        if (stored) {
          return await prisma.lesson.update({
            where: { id: lesson.id },
            data: {
              fileKey: stored.key,
              resourceFileBytes: null,
              resourceFileName,
            },
          });
        }
      }

      return lesson;
    } catch (e: unknown) {
      this.handlePrismaError(e, "create");
    }
  }

  /** List lessons with optional filters. */
  async findAll(filters: {
    tenantId: string;
    groupId?: string;
    weekOfFrom?: Date;
    weekOfTo?: Date;
  }) {
    // tenantId is required; caller must supply from context
    const where: Prisma.LessonWhereInput = {
      tenantId: filters.tenantId,
      ...(filters.groupId ? { groupId: filters.groupId } : {}),
      ...(filters.weekOfFrom || filters.weekOfTo
        ? {
            weekOf: {
              ...(filters.weekOfFrom ? { gte: filters.weekOfFrom } : {}),
              ...(filters.weekOfTo ? { lte: filters.weekOfTo } : {}),
            },
          }
        : {}),
    };

    return prisma.lesson.findMany({
      where,
      orderBy: { weekOf: "desc" },
      select: {
        id: true,
        tenantId: true,
        groupId: true,
        sessionId: true,
        title: true,
        description: true,
        fileKey: true,
        resourceFileName: true,
        weekOf: true,
        createdAt: true,
        updatedAt: true,
        group: {
          select: { id: true, name: true, minAge: true, maxAge: true },
        },
      },
    });
  }

  async findOne(id: string, tenantId: string) {
    const lesson = await prisma.lesson.findFirst({
      where: { id, tenantId },
      select: {
        id: true,
        tenantId: true,
        groupId: true,
        sessionId: true,
        title: true,
        description: true,
        fileKey: true,
        resourceFileName: true,
        weekOf: true,
        createdAt: true,
        updatedAt: true,
        group: {
          select: { id: true, name: true, minAge: true, maxAge: true },
        },
      },
    });
    if (!lesson) throw new NotFoundException("Lesson not found");
    return lesson;
  }

  /** Get stored resource file for download. Returns null if no file stored. */
  async getResourceFile(
    id: string,
    tenantId: string,
  ): Promise<{ buffer: Buffer; fileName: string } | null> {
    const lesson = await prisma.lesson.findFirst({
      where: { id, tenantId },
      select: {
        fileKey: true,
        resourceFileBytes: true,
        resourceFileName: true,
      },
    });
    if (!lesson) return null;
    if (lesson.fileKey) {
      const buffer = await this.storage.downloadObject(
        process.env.SUPABASE_STORAGE_PRIVATE_BUCKET ?? "",
        lesson.fileKey,
      );
      if (buffer) {
        return {
          buffer,
          fileName: lesson.resourceFileName ?? "resource",
        };
      }
    }
    if (!lesson.resourceFileBytes) return null;
    return {
      buffer: Buffer.from(lesson.resourceFileBytes),
      fileName: lesson.resourceFileName ?? "resource",
    };
  }

  /** Update a lesson. Tenant is immutable; optionally validate new group. */
  async update(id: string, dto: UpdateLessonDto, tenantId: string) {
    const existing = await prisma.lesson.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException("Lesson not found");

    // Validate group tenant ownership if groupId is provided (including explicit null to detach)
    if (dto.groupId !== undefined && dto.groupId !== null) {
      const group = await prisma.group.findUnique({
        where: { id: dto.groupId },
        select: { id: true, tenantId: true },
      });
      if (!group) throw new NotFoundException("Group not found");
      if (group.tenantId !== existing.tenantId) {
        throw new BadRequestException(
          "Group must belong to the same tenant as the lesson",
        );
      }
    }

    if (dto.sessionId !== undefined) {
      if (dto.sessionId) {
        const session = await prisma.session.findUnique({
          where: { id: dto.sessionId },
          select: { id: true, tenantId: true },
        });
        if (!session) throw new NotFoundException("Session not found");
        if (session.tenantId !== existing.tenantId) {
          throw new BadRequestException(
            "Session must belong to the same tenant as the lesson",
          );
        }
      }
    }

    let resourceFileBytes: Buffer | null | undefined = undefined;
    let resourceFileName: string | null | undefined = undefined;
    let fileKey: string | null | undefined =
      dto.fileKey === undefined ? undefined : dto.fileKey;
    if (dto.resourceFileBase64 !== undefined) {
      if (dto.resourceFileBase64 && dto.resourceFileBase64.trim()) {
        try {
          const decoded = decodeResourceFile(
            dto.resourceFileBase64,
            dto.resourceFileName ?? undefined,
          );
          if (decoded) {
            resourceFileBytes = decoded.buffer;
            resourceFileName = decoded.fileName;
            const stored = await this.storage.uploadObject({
              bucket: "private",
              key: lessonResourceKey(existing.tenantId, id, decoded.fileName),
              body: decoded.buffer,
              contentType: "application/octet-stream",
            });
            if (stored) {
              fileKey = stored.key;
              resourceFileBytes = null;
            }
          }
        } catch (e) {
          throw new BadRequestException(
            e instanceof Error ? e.message : "Invalid resource file",
          );
        }
      } else {
        resourceFileBytes = null;
        resourceFileName = null;
        fileKey = null;
      }
    }

    try {
      return await prisma.lesson.update({
        where: { id },
        data: {
          groupId: dto.groupId === undefined ? undefined : dto.groupId,
          sessionId: dto.sessionId === undefined ? undefined : dto.sessionId,
          title: dto.title ?? undefined,
          description:
            dto.description === undefined ? undefined : dto.description,
          fileKey,
          weekOf: dto.weekOf ?? undefined,
          ...(resourceFileBytes !== undefined ? { resourceFileBytes } : {}),
          ...(resourceFileName !== undefined ? { resourceFileName } : {}),
        },
      });
    } catch (e: unknown) {
      this.handlePrismaError(e, "update", id);
    }
  }

  async remove(id: string, tenantId: string) {
    try {
      const existing = await prisma.lesson.findFirst({
        where: { id, tenantId },
      });
      if (!existing) throw new NotFoundException("Lesson not found");
      return await prisma.lesson.delete({ where: { id } });
    } catch (e: unknown) {
      this.handlePrismaError(e, "delete", id);
    }
  }

  private handlePrismaError(
    e: unknown,
    action: "create" | "update" | "delete",
    id?: string,
  ): never {
    const code =
      typeof e === "object" && e !== null && "code" in e
        ? String((e as { code?: unknown }).code)
        : undefined;
    const message =
      typeof e === "object" &&
      e !== null &&
      "message" in e &&
      typeof (e as { message?: unknown }).message === "string"
        ? (e as { message: string }).message
        : "Unknown error";

    if (code === "P2025") {
      // Record not found (mostly for update/delete)
      throw new NotFoundException(
        id ? `Lesson with id ${id} not found` : "Lesson not found",
      );
    }

    if (code === "P2002") {
      // Unique constraint failed
      throw new BadRequestException(
        `Duplicate value violates a unique constraint: ${message}`,
      );
    }

    if (code === "P2003") {
      // Foreign key constraint failed
      throw new BadRequestException(
        `Invalid reference for lesson ${action}: ${message}`,
      );
    }

    throw new BadRequestException(`Failed to ${action} lesson: ${message}`);
  }
}
