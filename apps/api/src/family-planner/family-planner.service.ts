import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { prisma } from "@pathway/db";
import type {
  CreateActivityDto,
  CreateCalendarItemDto,
  CreateTaskDto,
} from "./dto";

const activitySelect = {
  id: true,
  tenantId: true,
  childId: true,
  title: true,
  scheduledAt: true,
  durationMinutes: true,
  subjectIds: true,
  planNotes: true,
  resourcesNote: true,
  createdByUserId: true,
  createdAt: true,
  updatedAt: true,
} as const;

const taskSelect = {
  id: true,
  tenantId: true,
  title: true,
  assignedToUserId: true,
  dueAt: true,
  priority: true,
  completedAt: true,
  createdByUserId: true,
  createdAt: true,
  updatedAt: true,
} as const;

const calendarItemSelect = {
  id: true,
  tenantId: true,
  title: true,
  who: true,
  scheduledAt: true,
  location: true,
  createdByUserId: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class FamilyPlannerService {
  async listActivities(tenantId: string) {
    return prisma.activity.findMany({
      where: { tenantId },
      orderBy: { scheduledAt: "asc" },
      select: activitySelect,
    });
  }

  async createActivity(dto: CreateActivityDto, tenantId: string, createdByUserId: string) {
    return prisma.activity.create({
      data: {
        tenantId,
        childId: dto.childId,
        title: dto.title,
        scheduledAt: dto.scheduledAt,
        durationMinutes: dto.durationMinutes ?? null,
        subjectIds: dto.subjectIds ?? [],
        planNotes: dto.planNotes ?? null,
        resourcesNote: dto.resourcesNote ?? null,
        createdByUserId,
      },
      select: activitySelect,
    });
  }

  async listTasks(tenantId: string) {
    return prisma.task.findMany({
      where: { tenantId },
      orderBy: [{ completedAt: "asc" }, { dueAt: "asc" }],
      select: taskSelect,
    });
  }

  async createTask(dto: CreateTaskDto, tenantId: string, createdByUserId: string) {
    if (dto.assignedToUserId) {
      await this.assertUserBelongsToTenant(dto.assignedToUserId, tenantId);
    }

    return prisma.task.create({
      data: {
        tenantId,
        title: dto.title,
        assignedToUserId: dto.assignedToUserId ?? null,
        dueAt: dto.dueAt ?? null,
        priority: dto.priority ?? "NORMAL",
        createdByUserId,
      },
      select: taskSelect,
    });
  }

  async completeTask(id: string, tenantId: string) {
    const task = await prisma.task.findFirst({ where: { id, tenantId } });
    if (!task) throw new NotFoundException("Task not found");
    return prisma.task.update({
      where: { id },
      data: { completedAt: new Date() },
      select: taskSelect,
    });
  }

  async listCalendarItems(tenantId: string) {
    return prisma.calendarItem.findMany({
      where: { tenantId },
      orderBy: { scheduledAt: "asc" },
      select: calendarItemSelect,
    });
  }

  async createCalendarItem(
    dto: CreateCalendarItemDto,
    tenantId: string,
    createdByUserId: string,
  ) {
    return prisma.calendarItem.create({
      data: {
        tenantId,
        title: dto.title,
        who: dto.who ?? null,
        scheduledAt: dto.scheduledAt,
        location: dto.location ?? null,
        createdByUserId,
      },
      select: calendarItemSelect,
    });
  }

  private async assertUserBelongsToTenant(userId: string, tenantId: string): Promise<void> {
    const siteMembership = await prisma.siteMembership.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
      select: { id: true },
    });
    if (siteMembership) return;

    const tenantRole = await prisma.userTenantRole.findFirst({
      where: { tenantId, userId },
      select: { id: true },
    });
    if (tenantRole) return;

    throw new BadRequestException("Assigned user must belong to the current tenant");
  }
}
