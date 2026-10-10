import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { CurrentOrg, CurrentTenant } from "@pathway/auth";
import { z } from "zod";
import { PermissionGuard } from "../access-control/permission.guard";
import { RequirePermission } from "../access-control/require-permission.decorator";
import { AuthUserGuard } from "../auth/auth-user.guard";
import { stripVercelRoutingQueryParam } from "../config/vercel-request-url";
import { AnnouncementsService } from "./announcements.service";

const listQuery = z
  .object({
    audience: z.enum(["ALL", "PARENTS", "STAFF"]).optional(),
    publishedOnly: z.coerce.boolean().optional(),
  })
  .strict();
const idParam = z.string().uuid("id must be a valid UUID");

/** Read compatibility for the existing site notice management screen. */
@UseGuards(AuthUserGuard, PermissionGuard)
@RequirePermission("notices.manage")
@Controller("announcements")
export class AnnouncementsController {
  constructor(
    @Inject(AnnouncementsService)
    private readonly service: AnnouncementsService,
  ) {}

  @Get()
  async findAll(
    @Query() query: unknown,
    @CurrentTenant("tenantId") tenantId: string,
    @CurrentOrg("orgId") orgId: string,
  ) {
    stripVercelRoutingQueryParam(query);
    const parsed = listQuery.safeParse(query);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.service.findAll({ tenantId, orgId, ...parsed.data });
  }

  @Get(":id")
  async findOne(
    @Param("id") id: string,
    @CurrentTenant("tenantId") tenantId: string,
    @CurrentOrg("orgId") orgId: string,
  ) {
    const parsed = idParam.safeParse(id);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.service.findOne(parsed.data, tenantId, orgId);
  }

  @Post()
  retiredCreate(): never {
    return this.service.retiredWrite();
  }

  @Patch(":id")
  retiredUpdate(): never {
    return this.service.retiredWrite();
  }

  @Delete(":id")
  retiredDelete(): never {
    return this.service.retiredWrite();
  }
}
