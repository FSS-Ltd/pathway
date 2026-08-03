import { BadRequestException, Body, Controller, Get, Inject, Patch, Post, UseGuards } from "@nestjs/common";
import { CurrentTenant } from "@pathway/auth";
import { AuthUserGuard } from "../auth/auth-user.guard";
import { learningDaysSchema, notificationPreferencesSchema, planningPreferencesSchema } from "./dto";
import { HouseholdSetupService } from "./household-setup.service";

/**
 * Household-level setup state (NexSteps Home, H2/Plan 05): the guided
 * setup flow's learning-days preference and completion signal. Every
 * authenticated household member may read/update this - unlike
 * family-planner, there is no dedicated capability for it, matching
 * children.controller.ts's precedent of plain AuthUserGuard for
 * household-config endpoints.
 */
@Controller("household-setup")
@UseGuards(AuthUserGuard)
export class HouseholdSetupController {
  constructor(
    @Inject(HouseholdSetupService) private readonly service: HouseholdSetupService,
  ) {}

  @Get("status")
  status(@CurrentTenant("tenantId") tenantId: string) {
    return this.service.getStatus(tenantId);
  }

  @Patch("learning-days")
  updateLearningDays(@Body() body: unknown, @CurrentTenant("tenantId") tenantId: string) {
    const parsed = learningDaysSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.format());
    }
    return this.service.updateLearningDays(parsed.data, tenantId);
  }

  @Post("complete")
  completeSetup(@CurrentTenant("tenantId") tenantId: string) {
    return this.service.completeSetup(tenantId);
  }

  @Get("planning-preferences")
  getPlanningPreferences(@CurrentTenant("tenantId") tenantId: string) {
    return this.service.getPlanningPreferences(tenantId);
  }

  @Patch("planning-preferences")
  updatePlanningPreferences(@Body() body: unknown, @CurrentTenant("tenantId") tenantId: string) {
    const parsed = planningPreferencesSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.format());
    }
    return this.service.updatePlanningPreferences(parsed.data, tenantId);
  }

  @Get("notification-preferences")
  getNotificationPreferences(@CurrentTenant("tenantId") tenantId: string) {
    return this.service.getNotificationPreferences(tenantId);
  }

  @Patch("notification-preferences")
  updateNotificationPreferences(@Body() body: unknown, @CurrentTenant("tenantId") tenantId: string) {
    const parsed = notificationPreferencesSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.format());
    }
    return this.service.updateNotificationPreferences(parsed.data, tenantId);
  }
}
