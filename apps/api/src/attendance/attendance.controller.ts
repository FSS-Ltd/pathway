import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Param,
  Body,
  Query,
  BadRequestException,
  UseGuards,
  Inject,
} from "@nestjs/common";
import { AttendanceService } from "./attendance.service";
import {
  createAttendanceDto,
  CreateAttendanceDto,
} from "./dto/create-attendance.dto";
import {
  updateAttendanceDto,
  UpdateAttendanceDto,
} from "./dto/update-attendance.dto";
import { upsertSessionAttendanceDto } from "./dto/upsert-session-attendance.dto";
import { CurrentTenant } from "@pathway/auth";
import { AuthUserGuard } from "../auth/auth-user.guard";
import { PermissionGuard } from "../access-control/permission.guard";
import { RequirePermission } from "../access-control/require-permission.decorator";

function parseDateOrThrow(label: string, value?: string): Date {
  if (value == null) throw new BadRequestException(`${label} is required`);
  const d = new Date(value);
  if (Number.isNaN(d.getTime()))
    throw new BadRequestException(`${label} must be a valid ISO date`);
  return d;
}

@UseGuards(AuthUserGuard, PermissionGuard)
@Controller("attendance")
export class AttendanceController {
  constructor(@Inject(AttendanceService) private readonly attendanceService: AttendanceService) {}

  @Get()
  @RequirePermission("attendance.read")
  async list(
    @CurrentTenant("tenantId") tenantId: string,
    @Query("sessionId") sessionId?: string,
  ) {
    return this.attendanceService.list(tenantId, sessionId);
  }

  @Get("session-summaries")
  @RequirePermission("attendance.read")
  async getSessionSummaries(
    @CurrentTenant("tenantId") tenantId: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    const fromDate = parseDateOrThrow("from", from);
    const toDate = parseDateOrThrow("to", to);
    return this.attendanceService.getSessionSummaries(
      tenantId,
      fromDate,
      toDate,
    );
  }

  @Get("session/:sessionId")
  @RequirePermission("attendance.read")
  async getSessionAttendanceDetail(
    @Param("sessionId") sessionId: string,
    @CurrentTenant("tenantId") tenantId: string,
  ) {
    return this.attendanceService.getSessionAttendanceDetail(
      sessionId,
      tenantId,
    );
  }

  @Put("session/:sessionId")
  @RequirePermission("attendance.manage")
  async upsertSessionAttendance(
    @Param("sessionId") sessionId: string,
    @Body() body: unknown,
    @CurrentTenant("tenantId") tenantId: string,
  ) {
    const parsed = upsertSessionAttendanceDto.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.format());
    }
    return this.attendanceService.upsertSessionAttendance(
      sessionId,
      tenantId,
      parsed.data,
    );
  }

  @Get(":id")
  @RequirePermission("attendance.read")
  async getById(
    @Param("id") id: string,
    @CurrentTenant("tenantId") tenantId: string,
  ) {
    return this.attendanceService.getById(id, tenantId);
  }

  @Post()
  @RequirePermission("attendance.manage")
  async create(
    @Body() body: CreateAttendanceDto,
    @CurrentTenant("tenantId") tenantId: string,
  ) {
    const parsed = createAttendanceDto.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.format());
    }
    return this.attendanceService.create(parsed.data, tenantId);
  }

  @Patch(":id")
  @RequirePermission("attendance.manage")
  async update(
    @Param("id") id: string,
    @Body() body: UpdateAttendanceDto,
    @CurrentTenant("tenantId") tenantId: string,
  ) {
    const parsed = updateAttendanceDto.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.format());
    }
    return this.attendanceService.update(id, parsed.data, tenantId);
  }
}
