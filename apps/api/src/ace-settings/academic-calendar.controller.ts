import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Post,
  UseGuards,
} from "@nestjs/common";
import { PathwayRequestContext } from "@pathway/auth";
import { z } from "zod";
import { PermissionGuard } from "../access-control/permission.guard";
import { RequirePermission } from "../access-control/require-permission.decorator";
import { AuthUserGuard } from "../auth/auth-user.guard";
import { AcademicCalendarService } from "./academic-calendar.service";
import { createAcademicYearSchema } from "./dto/academic-calendar.dto";

@UseGuards(AuthUserGuard, PermissionGuard)
@Controller("ace")
export class AcademicCalendarController {
  constructor(
    @Inject(AcademicCalendarService)
    private readonly service: AcademicCalendarService,
    @Inject(PathwayRequestContext)
    private readonly requestContext: PathwayRequestContext,
  ) {}

  @Get("academic-years")
  @RequirePermission("ace.settings.read")
  list() {
    return this.service.list(this.actor());
  }

  @Post("academic-years")
  @RequirePermission("ace.settings.manage")
  async create(@Body() body: unknown) {
    try {
      const command = await createAcademicYearSchema.parseAsync(body);
      return this.service.create(command, this.actor());
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new BadRequestException(error.flatten());
      }
      throw error;
    }
  }

  private actor() {
    const context = this.requestContext.requireContext();
    return {
      tenantId: context.tenant.tenantId,
      orgId: context.org.orgId,
      userId: context.user.userId,
    };
  }
}
