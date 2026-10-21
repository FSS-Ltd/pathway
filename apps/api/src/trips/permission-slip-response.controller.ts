import {
  BadRequestException,
  Body,
  Controller,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { PathwayRequestContext } from "@pathway/auth";
import type { Request } from "express";
import { z } from "zod";
import { PermissionGuard } from "../access-control/permission.guard";
import { RequirePermission } from "../access-control/require-permission.decorator";
import { AuthUserGuard } from "../auth/auth-user.guard";
import { recordPhysicalResponseSchema } from "./dto/record-physical-response.dto";
import { respondToSlipSchema } from "./dto/respond-to-slip.dto";
import { PermissionSlipExceptionService } from "./permission-slip-exception.service";
import { PermissionSlipResponseService } from "./permission-slip-response.service";
import { tripSlipIdSchema } from "./trip-slip.dto";

@UseGuards(AuthUserGuard, PermissionGuard)
@Controller()
export class PermissionSlipResponseController {
  constructor(
    @Inject(PermissionSlipResponseService)
    private readonly responses: PermissionSlipResponseService,
    @Inject(PermissionSlipExceptionService)
    private readonly exceptions: PermissionSlipExceptionService,
    @Inject(PathwayRequestContext)
    private readonly context: PathwayRequestContext,
  ) {}

  @Post("ace/family/sites/:siteId/permission-slips/:slipId/respond")
  @RequirePermission("school.permission_slips.respond")
  respond(
    @Param("siteId") siteId: string,
    @Param("slipId") slipId: string,
    @Body() body: unknown,
    @Req() request: Request,
  ) {
    return this.responses.respond(
      this.parse(tripSlipIdSchema, slipId),
      this.parse(respondToSlipSchema, body),
      this.actor(siteId),
      {
        ipAddress: request.ip?.slice(0, 64) ?? null,
        userAgent: request.get("user-agent")?.slice(0, 512) ?? null,
      },
    );
  }

  @Post("school/sites/:siteId/permission-slips/:slipId/exceptions")
  @RequirePermission("school.permission_slips.manage")
  recordException(
    @Param("siteId") siteId: string,
    @Param("slipId") slipId: string,
    @Body() body: unknown,
  ) {
    return this.exceptions.record(
      this.parse(tripSlipIdSchema, slipId),
      this.parse(recordPhysicalResponseSchema, body),
      this.actor(siteId),
    );
  }

  private actor(siteId: string) {
    const expectedSiteId = this.parse(tripSlipIdSchema, siteId);
    const context = this.context.requireContext();
    if (context.tenant.tenantId !== expectedSiteId)
      throw new NotFoundException("School site not found");
    return {
      tenantId: expectedSiteId,
      orgId: context.org.orgId,
      userId: context.user.userId,
    };
  }

  private parse<T extends z.ZodTypeAny>(
    schema: T,
    value: unknown,
  ): z.output<T> {
    const result = schema.safeParse(value);
    if (!result.success) throw new BadRequestException(result.error.flatten());
    return result.data;
  }
}
