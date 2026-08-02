import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { CurrentTenant } from "@pathway/auth";
import type { Request } from "express";
import { z } from "zod";
import { AuthUserGuard } from "../auth/auth-user.guard";
import { RequireCapability } from "../platform/capability.decorator";
import { CapabilityGuard } from "../platform/capability.guard";
import {
  createActivitySchema,
  createCalendarItemSchema,
  createTaskSchema,
} from "./dto";
import { FamilyPlannerService } from "./family-planner.service";

type AuthenticatedRequest = Request & { authUserId?: string };

const idSchema = z.string().uuid();

@Controller("family-planner")
@UseGuards(AuthUserGuard, CapabilityGuard)
export class FamilyPlannerController {
  constructor(
    @Inject(FamilyPlannerService) private readonly service: FamilyPlannerService,
  ) {}

  @Get("activities")
  @RequireCapability("family.activities.read")
  listActivities(@CurrentTenant("tenantId") tenantId: string) {
    return this.service.listActivities(tenantId);
  }

  @Post("activities")
  @RequireCapability("family.activities.write")
  createActivity(
    @Body() body: unknown,
    @CurrentTenant("tenantId") tenantId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.createActivity(
      this.parse(createActivitySchema, body),
      tenantId,
      this.actorId(request),
    );
  }

  @Get("tasks")
  @RequireCapability("family.tasks.read")
  listTasks(@CurrentTenant("tenantId") tenantId: string) {
    return this.service.listTasks(tenantId);
  }

  @Post("tasks")
  @RequireCapability("family.tasks.write")
  createTask(
    @Body() body: unknown,
    @CurrentTenant("tenantId") tenantId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.createTask(
      this.parse(createTaskSchema, body),
      tenantId,
      this.actorId(request),
    );
  }

  @Post("tasks/:id/complete")
  @RequireCapability("family.tasks.write")
  completeTask(
    @Param("id") rawId: string,
    @CurrentTenant("tenantId") tenantId: string,
  ) {
    return this.service.completeTask(this.parseId(rawId), tenantId);
  }

  @Get("calendar-items")
  @RequireCapability("family.calendar.read")
  listCalendarItems(@CurrentTenant("tenantId") tenantId: string) {
    return this.service.listCalendarItems(tenantId);
  }

  @Post("calendar-items")
  @RequireCapability("family.calendar.write")
  createCalendarItem(
    @Body() body: unknown,
    @CurrentTenant("tenantId") tenantId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.createCalendarItem(
      this.parse(createCalendarItemSchema, body),
      tenantId,
      this.actorId(request),
    );
  }

  private actorId(request: AuthenticatedRequest): string {
    if (!request.authUserId) {
      throw new BadRequestException("Authentication required");
    }
    return request.authUserId;
  }

  private parse<T>(schema: z.ZodType<T>, value: unknown): T {
    const parsed = schema.safeParse(value);
    if (!parsed.success) throw new BadRequestException(parsed.error.format());
    return parsed.data;
  }

  private parseId(value: string): string {
    return this.parse(idSchema, value);
  }
}
