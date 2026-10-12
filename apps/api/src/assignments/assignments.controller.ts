import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  Req,
  Inject,
} from "@nestjs/common";
import type { Request } from "express";
import { AssignmentsService } from "./assignments.service";
import { z } from "zod";
import {
  createAssignmentDto,
  type CreateAssignmentDto,
} from "./dto/create-assignment.dto";
import {
  updateAssignmentDto,
  type UpdateAssignmentDto,
} from "./dto/update-assignment.dto";
import { AssignmentStatus, Role } from "@pathway/db";
import { CurrentTenant, CurrentOrg } from "@pathway/auth";
import { AuthUserGuard } from "../auth/auth-user.guard";
import { UseGuards } from "@nestjs/common";
import { EntitlementsEnforcementService } from "../billing/entitlements-enforcement.service";

@UseGuards(AuthUserGuard)
@Controller("assignments")
export class AssignmentsController {
  constructor(
    @Inject(AssignmentsService) private readonly assignmentsService: AssignmentsService,
    @Inject(EntitlementsEnforcementService) private readonly enforcement: EntitlementsEnforcementService,
  ) {}

  @Post()
  async create(
    @Body() body: unknown,
    @CurrentTenant("tenantId") tenantId: string,
    @CurrentOrg("orgId") orgId: string,
  ) {
    const dto: CreateAssignmentDto = createAssignmentDto.parse(body);
    const av30 = await this.enforcement.checkAv30ForOrg(orgId);
    this.enforcement.assertWithinHardCap(av30);
    // TODO(Epic4-UI): Surface av30 status in response metadata for warnings
    return this.assignmentsService.create(dto, tenantId, orgId);
  }

  @Get()
  async findAll(
    @Query()
    query: Record<string, unknown>,
    @CurrentTenant("tenantId") tenantId: string,
  ) {
    const querySchema = z.object({
      sessionId: z.string().uuid().optional(),
      userId: z.string().uuid().optional(),
      role: z.nativeEnum(Role).optional(),
      status: z.nativeEnum(AssignmentStatus).optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
    });

    const filters = querySchema.parse(query);

    return this.assignmentsService.findAll({
      tenantId,
      ...(filters.sessionId ? { sessionId: filters.sessionId } : {}),
      ...(filters.userId ? { userId: filters.userId } : {}),
      ...(filters.role ? { role: filters.role } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.dateFrom ? { dateFrom: filters.dateFrom } : {}),
      ...(filters.dateTo ? { dateTo: filters.dateTo } : {}),
    });
  }

  @Get(":id")
  async findOne(
    @Param("id") id: string,
    @CurrentTenant("tenantId") tenantId: string,
  ) {
    // validate id format
    z.string().uuid().parse(id);
    return this.assignmentsService.findOne(id, tenantId);
  }

  @Patch(":id")
  async update(
    @Param("id") id: string,
    @Body() body: unknown,
    @CurrentTenant("tenantId") tenantId: string,
    @CurrentOrg("orgId") orgId: string,
    @Req() req: Request & { authUserId?: string },
  ) {
    z.string().uuid().parse(id);
    const dto: UpdateAssignmentDto = updateAssignmentDto.parse(body);
    const currentUserId = req.authUserId;
    return this.assignmentsService.update(id, dto, tenantId, orgId, currentUserId);
  }

  @Delete(":id")
  async remove(
    @Param("id") id: string,
    @CurrentTenant("tenantId") tenantId: string,
  ) {
    z.string().uuid().parse(id);
    await this.assignmentsService.remove(id, tenantId);
    return { id, deleted: true };
  }
}
