import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  BadRequestException,
  Inject,
} from "@nestjs/common";
import { z } from "zod";
import { AnnouncementsService, type Audience } from "./announcements.service";
import { createAnnouncementDto, updateAnnouncementDto } from "./dto";
import { CurrentTenant, CurrentOrg } from "@pathway/auth";
import { AuthUserGuard } from "../auth/auth-user.guard";
import { PermissionGuard } from "../access-control/permission.guard";
import { RequirePermission } from "../access-control/require-permission.decorator";
import { EntitlementsEnforcementService } from "../billing/entitlements-enforcement.service";
import { stripVercelRoutingQueryParam } from "../config/vercel-request-url";

const listQuery = z
  .object({
    audience: z.enum(["ALL", "PARENTS", "STAFF"]).optional(),
    publishedOnly: z.coerce.boolean().optional(),
  })
  .strict();

const idParam = z.object({ id: z.string().uuid("id must be a valid UUID") });

@UseGuards(AuthUserGuard, PermissionGuard)
@Controller("announcements")
export class AnnouncementsController {
  constructor(
    @Inject(AnnouncementsService) private readonly service: AnnouncementsService,
    @Inject(EntitlementsEnforcementService) private readonly enforcement: EntitlementsEnforcementService,
  ) {}

  @Post()
  @RequirePermission("notices.manage")
  async create(
    @Body() body: unknown,
    @CurrentTenant("tenantId") tenantId: string,
    @CurrentOrg("orgId") orgId: string,
  ) {
    // Service will validate again, but we parse here to provide immediate 400s with clear messages
    const dto = await createAnnouncementDto.parseAsync(body);
    if (dto.tenantId !== tenantId) {
      throw new BadRequestException("tenantId must match current tenant");
    }
    const av30 = await this.enforcement.checkAv30ForOrg(orgId);
    this.enforcement.assertWithinHardCap(av30);
    // TODO(Epic4-UI): Surface av30 status in response metadata for warnings
    return this.service.create(dto, tenantId);
  }

  @Get()
  @RequirePermission("notices.read")
  async findAll(
    @Query() query: unknown,
    @CurrentTenant("tenantId") tenantId: string,
  ) {
    stripVercelRoutingQueryParam(query);
    const q = await listQuery.parseAsync(query);
    return this.service.findAll({
      tenantId,
      audience: q.audience as Audience | undefined,
      publishedOnly: q.publishedOnly ?? false,
    });
  }

  @Get(":id")
  @RequirePermission("notices.read")
  async findOne(
    @Param() params: unknown,
    @CurrentTenant("tenantId") tenantId: string,
  ) {
    const { id } = await idParam.parseAsync(params);
    return this.service.findOne(id, tenantId);
  }

  @Patch(":id")
  @RequirePermission("notices.manage")
  async update(
    @Param() params: unknown,
    @Body() body: unknown,
    @CurrentTenant("tenantId") tenantId: string,
    @CurrentOrg("orgId") orgId: string,
  ) {
    const { id } = await idParam.parseAsync(params);
    const dto = await updateAnnouncementDto.parseAsync(body);
    // If publish-on-update, enforce AV30 hard cap; otherwise no-op
    if (dto.publishedAt) {
      const av30 = await this.enforcement.checkAv30ForOrg(orgId);
      this.enforcement.assertWithinHardCap(av30);
      // TODO(Epic4-UI): Surface av30 status in response metadata for warnings
    }
    return this.service.update(id, dto, tenantId);
  }

  @Delete(":id")
  @RequirePermission("notices.manage")
  async remove(
    @Param() params: unknown,
    @CurrentTenant("tenantId") tenantId: string,
  ) {
    const { id } = await idParam.parseAsync(params);
    return this.service.remove(id, tenantId);
  }
}
