import { BadRequestException, Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { PathwayRequestContext } from "@pathway/auth";
import { z } from "zod";
import { PermissionGuard } from "../access-control/permission.guard";
import { RequirePermission } from "../access-control/require-permission.decorator";
import { AuthUserGuard } from "../auth/auth-user.guard";
import { paceRosterQuerySchema } from "./dto/pace-query.dto";
import { createPaceAssessmentSchema } from "./dto/create-pace-assessment.dto";
import { PaceCommandService } from "./pace-command.service";
import { PaceQueryService } from "./pace-query.service";

@UseGuards(AuthUserGuard, PermissionGuard)
@Controller("ace/pace")
export class PaceController {
  constructor(
    private readonly service: PaceQueryService,
    private readonly commandService: PaceCommandService,
    private readonly requestContext: PathwayRequestContext,
  ) {}

  @Get("roster")
  @RequirePermission("ace.pace.read")
  async roster(@Query() query: unknown) {
    try {
      return await this.service.listRoster(
        this.actor(),
        await paceRosterQuerySchema.parseAsync(query),
      );
    } catch (error) {
      if (error instanceof z.ZodError) throw new BadRequestException(error.flatten());
      throw error;
    }
  }

  @Post("assessments")
  @RequirePermission("ace.pace.record")
  async recordAssessment(@Body() body: unknown) {
    try {
      return await this.commandService.record(
        await createPaceAssessmentSchema.parseAsync(body),
        this.actor(),
      );
    } catch (error) {
      if (error instanceof z.ZodError) throw new BadRequestException(error.flatten());
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
