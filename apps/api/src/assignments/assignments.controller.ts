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
  ForbiddenException,
  NotFoundException,
  UseGuards,
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
import { EntitlementsEnforcementService } from "../billing/entitlements-enforcement.service";
import {
  RotaAccessService,
  rotaActorFromRequest,
} from "../sessions/rota-access.service";

type AuthenticatedRequest = Request & {
  authUserId?: string;
  authIsSuperUser?: boolean;
};

@UseGuards(AuthUserGuard)
@Controller("assignments")
export class AssignmentsController {
  constructor(
    @Inject(AssignmentsService)
    private readonly assignmentsService: AssignmentsService,
    @Inject(EntitlementsEnforcementService)
    private readonly enforcement: EntitlementsEnforcementService,
    @Inject(RotaAccessService) private readonly rotaAccess: RotaAccessService,
  ) {}

  @Post()
  async create(
    @Body() body: unknown,
    @CurrentTenant("tenantId") tenantId: string,
    @CurrentOrg("orgId") orgId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.rotaAccess.assertManager(
      rotaActorFromRequest(req, orgId, tenantId),
    );
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
    @CurrentOrg("orgId") orgId: string,
    @Req() req: AuthenticatedRequest,
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
    const actor = rotaActorFromRequest(req, orgId, tenantId);
    const manager = await this.rotaAccess.canManage(actor);
    if (!manager && filters.userId && filters.userId !== actor.userId) {
      throw new ForbiddenException(
        "Rota access is limited to your assignments",
      );
    }

    return this.assignmentsService.findAll({
      tenantId,
      ...(filters.sessionId ? { sessionId: filters.sessionId } : {}),
      userId: manager ? filters.userId : actor.userId,
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
    @CurrentOrg("orgId") orgId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    z.string().uuid().parse(id);
    const actor = rotaActorFromRequest(req, orgId, tenantId);
    const assignment = await this.assignmentsService.findOne(id, tenantId);
    if (
      assignment.userId !== actor.userId &&
      !(await this.rotaAccess.canManage(actor))
    ) {
      throw new NotFoundException("Assignment not found");
    }
    return assignment;
  }

  @Patch(":id")
  async update(
    @Param("id") id: string,
    @Body() body: unknown,
    @CurrentTenant("tenantId") tenantId: string,
    @CurrentOrg("orgId") orgId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    z.string().uuid().parse(id);
    const dto: UpdateAssignmentDto = updateAssignmentDto.parse(body);
    const actor = rotaActorFromRequest(req, orgId, tenantId);
    const manager = await this.rotaAccess.canManage(actor);
    if (!manager) {
      if (!dto.status || dto.sessionId || dto.userId || dto.role) {
        throw new ForbiddenException(
          "Only your assignment status can be changed",
        );
      }
      const assignment = await this.assignmentsService.findOne(id, tenantId);
      if (assignment.userId !== actor.userId) {
        throw new NotFoundException("Assignment not found");
      }
    }
    return this.assignmentsService.update(
      id,
      dto,
      tenantId,
      orgId,
      manager ? undefined : actor.userId,
    );
  }

  @Delete(":id")
  async remove(
    @Param("id") id: string,
    @CurrentTenant("tenantId") tenantId: string,
    @CurrentOrg("orgId") orgId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    z.string().uuid().parse(id);
    await this.rotaAccess.assertManager(
      rotaActorFromRequest(req, orgId, tenantId),
    );
    await this.assignmentsService.remove(id, tenantId);
    return { id, deleted: true };
  }
}
