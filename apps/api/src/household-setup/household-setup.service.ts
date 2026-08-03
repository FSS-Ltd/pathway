import { Injectable } from "@nestjs/common";
import { prisma } from "@pathway/db";
import type { LearningDaysDto } from "./dto";
import {
  NOTIFICATION_PREFERENCES_DEFAULTS,
  PLANNING_PREFERENCES_DEFAULTS,
  type NotificationPreferencesDto,
  type PlanningPreferencesDto,
} from "./dto";

const statusSelect = {
  learningDays: true,
  setupCompletedAt: true,
} as const;

@Injectable()
export class HouseholdSetupService {
  async getStatus(tenantId: string) {
    return prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: statusSelect,
    });
  }

  async updateLearningDays(dto: LearningDaysDto, tenantId: string) {
    return prisma.tenant.update({
      where: { id: tenantId },
      data: { learningDays: dto.days },
      select: statusSelect,
    });
  }

  async completeSetup(tenantId: string) {
    return prisma.tenant.update({
      where: { id: tenantId },
      data: { setupCompletedAt: new Date() },
      select: statusSelect,
    });
  }

  async getPlanningPreferences(tenantId: string) {
    const { planningPreferences } = await prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { planningPreferences: true },
    });
    return { ...PLANNING_PREFERENCES_DEFAULTS, ...(planningPreferences as object) };
  }

  async updatePlanningPreferences(dto: PlanningPreferencesDto, tenantId: string) {
    const current = await this.getPlanningPreferences(tenantId);
    const merged = { ...current, ...dto };
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { planningPreferences: merged },
      select: { planningPreferences: true },
    });
    return merged;
  }

  async getNotificationPreferences(tenantId: string) {
    const { notificationPreferences } = await prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { notificationPreferences: true },
    });
    return { ...NOTIFICATION_PREFERENCES_DEFAULTS, ...(notificationPreferences as object) };
  }

  async updateNotificationPreferences(dto: NotificationPreferencesDto, tenantId: string) {
    const current = await this.getNotificationPreferences(tenantId);
    const merged = { ...current, ...dto };
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { notificationPreferences: merged },
      select: { notificationPreferences: true },
    });
    return merged;
  }
}
