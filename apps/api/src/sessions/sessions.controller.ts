import {
  Controller,
  Get,
  Param,
  Post,
  Patch,
  Delete,
  Body,
  Query,
  BadRequestException,
  UseGuards,
  Inject,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import { SessionsService, SessionListFilters } from "./sessions.service";
import { StaffAttendanceService } from "./staff-attendance.service";
import { CreateSessionDto } from "./dto/create-session.dto";
import { UpdateSessionDto } from "./dto/update-session.dto";
import { bulkCreateSessionsSchema } from "./dto/bulk-create-sessions.dto";
import { upsertStaffAttendanceDto } from "./dto/upsert-staff-attendance.dto";
import { CurrentTenant, CurrentOrg } from "@pathway/auth";
import { AuthUserGuard } from "../auth/auth-user.guard";
import { EntitlementsEnforcementService } from "../billing/entitlements-enforcement.service";
import { RotaAccessService, rotaActorFromRequest } from "./rota-access.service";

type AuthenticatedRequest = Request & {
  authUserId?: string;
  authIsSuperUser?: boolean;
};

type IsoDateString = string; // ISO 8601 expected

interface SessionsQuery {
  groupId?: string;
  from?: IsoDateString;
  to?: IsoDateString;
}

function parseDateOrThrow(label: string, value?: string): Date | undefined {
  if (value == null) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new BadRequestException(`${label} must be a valid ISO date`);
  }
  return d;
}

@Controller("sessions")
export class SessionsController {
  constructor(
    @Inject(SessionsService) private readonly svc: SessionsService,
    @Inject(StaffAttendanceService)
    private readonly staffAttendanceSvc: StaffAttendanceService,
    @Inject(EntitlementsEnforcementService)
    private readonly enforcement: EntitlementsEnforcementService,
    @Inject(RotaAccessService) private readonly rotaAccess: RotaAccessService,
  ) {}

  @Get()
  @UseGuards(AuthUserGuard)
  async list(
    @Query() q: SessionsQuery,
    @CurrentTenant("tenantId") tenantId: string,
    @CurrentOrg("orgId") orgId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const actor = rotaActorFromRequest(req, orgId, tenantId);
    const filters: SessionListFilters = {
      tenantId,
      staffUserId: (await this.rotaAccess.canManage(actor))
        ? undefined
        : actor.userId,
      groupId: q.groupId,
      from: parseDateOrThrow("from", q.from),
      to: parseDateOrThrow("to", q.to),
    };
    return this.svc.list(filters);
  }

  @Get(":id")
  @UseGuards(AuthUserGuard)
  async getById(
    @Param("id") id: string,
    @CurrentTenant("tenantId") tenantId: string,
    @CurrentOrg("orgId") orgId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.rotaAccess.assertSessionVisible(
      rotaActorFromRequest(req, orgId, tenantId),
      id,
    );
    return this.svc.getById(id, tenantId);
  }

  @Post()
  @UseGuards(AuthUserGuard)
  async create(
    @Body() dto: CreateSessionDto,
    @CurrentTenant("tenantId") tenantId: string,
    @CurrentOrg("orgId") orgId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.rotaAccess.assertManager(
      rotaActorFromRequest(req, orgId, tenantId),
    );
    if (
      dto.startsAt &&
      dto.endsAt &&
      new Date(dto.endsAt) <= new Date(dto.startsAt)
    ) {
      throw new BadRequestException("endsAt must be after startsAt");
    }
    if (dto.tenantId && dto.tenantId !== tenantId) {
      throw new BadRequestException("tenantId must match current tenant");
    }
    const av30 = await this.enforcement.checkAv30ForOrg(orgId);
    this.enforcement.assertWithinHardCap(av30);
    // TODO(Epic4-UI): Surface av30 status in response metadata for warnings
    return this.svc.create({ ...dto, tenantId }, tenantId);
  }

  @Post("bulk")
  @UseGuards(AuthUserGuard)
  async bulkCreate(
    @Body() body: unknown,
    @CurrentTenant("tenantId") tenantId: string,
    @CurrentOrg("orgId") orgId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.rotaAccess.assertManager(
      rotaActorFromRequest(req, orgId, tenantId),
    );
    const parsed = bulkCreateSessionsSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    const av30 = await this.enforcement.checkAv30ForOrg(orgId);
    this.enforcement.assertWithinHardCap(av30);
    return this.svc.bulkCreate(parsed.data, tenantId);
  }

  @Patch(":id")
  @UseGuards(AuthUserGuard)
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateSessionDto,
    @CurrentTenant("tenantId") tenantId: string,
    @CurrentOrg("orgId") orgId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.rotaAccess.assertManager(
      rotaActorFromRequest(req, orgId, tenantId),
    );
    if (
      dto.startsAt &&
      dto.endsAt &&
      new Date(dto.endsAt) <= new Date(dto.startsAt)
    ) {
      throw new BadRequestException("endsAt must be after startsAt");
    }
    if (dto.tenantId && dto.tenantId !== tenantId) {
      throw new BadRequestException("tenantId must match current tenant");
    }
    return this.svc.update(id, dto, tenantId);
  }

  @Delete(":id")
  @UseGuards(AuthUserGuard)
  async delete(
    @Param("id") id: string,
    @CurrentTenant("tenantId") tenantId: string,
    @CurrentOrg("orgId") orgId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.rotaAccess.assertManager(
      rotaActorFromRequest(req, orgId, tenantId),
    );
    return this.svc.delete(id, tenantId);
  }

  @Get(":id/staff-attendance")
  @UseGuards(AuthUserGuard)
  async getStaffAttendance(
    @Param("id") id: string,
    @CurrentTenant("tenantId") tenantId: string,
    @CurrentOrg("orgId") orgId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.rotaAccess.assertSessionVisible(
      rotaActorFromRequest(req, orgId, tenantId),
      id,
    );
    return this.staffAttendanceSvc.getRoster(id, tenantId);
  }

  @Patch(":id/staff-attendance")
  @UseGuards(AuthUserGuard)
  async patchStaffAttendance(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @CurrentTenant("tenantId") tenantId: string,
    @CurrentOrg("orgId") orgId: string,
  ) {
    const actor = rotaActorFromRequest(req, orgId, tenantId);
    await this.rotaAccess.assertSessionVisible(actor, id);
    const parsed = upsertStaffAttendanceDto.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.format());
    }
    return this.staffAttendanceSvc.upsert(
      id,
      tenantId,
      actor.userId,
      parsed.data,
    );
  }
}
