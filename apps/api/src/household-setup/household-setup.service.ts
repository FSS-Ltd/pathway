import { Injectable } from "@nestjs/common";
import { prisma } from "@pathway/db";
import type { LearningDaysDto } from "./dto";

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
}
