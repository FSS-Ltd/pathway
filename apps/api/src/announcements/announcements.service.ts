import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { prisma } from "@pathway/db";
import type { Prisma } from "@pathway/db";
import { createAnnouncementDto, updateAnnouncementDto } from "./dto";

export type Audience = "ALL" | "PARENTS" | "STAFF";

@Injectable()
export class AnnouncementsService {
  constructor() {}

  async create(raw: unknown, tenantId: string) {
    const dto = await createAnnouncementDto.parseAsync(raw);
    if (dto.tenantId !== tenantId) {
      throw new BadRequestException("tenantId must match current tenant");
    }

    // Ensure tenant exists BEFORE attempting the create so 404 is not swallowed by catch
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true },
    });
    if (!tenant) throw new NotFoundException("Tenant not found");

    try {
      return await prisma.announcement.create({
        data: {
          tenantId,
          title: dto.title,
          body: dto.body,
          audience: dto.audience,
          publishedAt: dto.publishedAt ?? null,
        },
      });
    } catch (e: unknown) {
      this.handlePrismaError(e, "create");
    }
  }

  async findAll(filters: {
    tenantId: string;
    audience?: Audience;
    publishedOnly?: boolean;
  }) {
    const where: Prisma.AnnouncementWhereInput = {
      tenantId: filters.tenantId,
      ...(filters.audience ? { audience: filters.audience } : {}),
      ...(filters.publishedOnly ? { publishedAt: { not: null } } : {}),
    };

    return prisma.announcement.findMany({
      where,
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    });
  }

  async findOne(id: string, tenantId: string) {
    const a = await prisma.announcement.findFirst({ where: { id, tenantId } });
    if (!a) throw new NotFoundException("Announcement not found");
    return a;
  }

  async update(id: string, raw: unknown, tenantId: string) {
    const dto = await updateAnnouncementDto.parseAsync(raw);
    const existing = await prisma.announcement.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException("Announcement not found");
    try {
      return await prisma.announcement.update({
        where: { id },
        data: {
          title: dto.title ?? undefined,
          body: dto.body ?? undefined,
          audience: dto.audience ?? undefined,
          publishedAt: dto.publishedAt ?? undefined,
        },
      });
    } catch (e: unknown) {
      this.handlePrismaError(e, "update", id);
    }
  }

  async remove(id: string, tenantId: string) {
    const existing = await prisma.announcement.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException("Announcement not found");
    try {
      return await prisma.announcement.delete({ where: { id } });
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

    if (code === "P2025")
      throw new NotFoundException(
        id ? `Announcement with id ${id} not found` : "Announcement not found",
      );
    if (code === "P2002")
      throw new BadRequestException(
        `Duplicate value violates a unique constraint: ${message}`,
      );
    if (code === "P2003")
      throw new BadRequestException(
        `Invalid reference for announcement ${action}: ${message}`,
      );

    throw new BadRequestException(
      `Failed to ${action} announcement: ${message}`,
    );
  }
}
