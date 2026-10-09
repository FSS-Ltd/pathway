import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Put,
  UseGuards,
} from "@nestjs/common";
import { PathwayRequestContext } from "@pathway/auth";
import { z } from "zod";
import { AuthUserGuard } from "../auth/auth-user.guard";
import { PermissionGuard } from "../access-control/permission.guard";
import { RequirePermission } from "../access-control/require-permission.decorator";
import { updateAceSettingsSchema } from "./dto/ace-settings.dto";
import { AceSettingsService } from "./ace-settings.service";

@UseGuards(AuthUserGuard, PermissionGuard)
@Controller("ace/settings")
export class AceSettingsController {
  constructor(
    @Inject(AceSettingsService) private readonly service: AceSettingsService,
    @Inject(PathwayRequestContext)
    private readonly requestContext: PathwayRequestContext,
  ) {}

  @Get()
  @RequirePermission("ace.settings.read")
  get() {
    return this.service.get(this.actor());
  }

  @Put()
  @RequirePermission("ace.settings.manage")
  async update(@Body() body: unknown) {
    try {
      const command = await updateAceSettingsSchema.parseAsync(body);
      return this.service.update(command, this.actor());
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
