import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import { PathwayRequestContext } from "@pathway/auth";
import { z } from "zod";
import { PermissionGuard } from "../access-control/permission.guard";
import { RequirePermission } from "../access-control/require-permission.decorator";
import { AuthUserGuard } from "../auth/auth-user.guard";
import { BehaviourCommandService } from "./behaviour-command.service";
import { BehaviourPolicyService } from "./behaviour-policy.service";
import { BehaviourQueryService } from "./behaviour-query.service";
import {
  behaviourCorrectionSchema,
  behaviourListQuerySchema,
  createBehaviourEntrySchema,
} from "./dto/behaviour-entry.dto";
import { updateBehaviourPolicySchema } from "./dto/behaviour-policy.dto";

@UseGuards(AuthUserGuard, PermissionGuard)
@Controller("ace/behaviour")
export class BehaviourController {
  constructor(
    private readonly policyService: BehaviourPolicyService,
    private readonly commandService: BehaviourCommandService,
    private readonly queryService: BehaviourQueryService,
    private readonly requestContext: PathwayRequestContext,
  ) {}

  @Get("policy")
  @RequirePermission("ace.behaviour.read")
  get() {
    return this.policyService.get(this.actor());
  }

  @Put("policy")
  @RequirePermission("ace.behaviour.policy.manage")
  async update(@Body() body: unknown) {
    try {
      return await this.policyService.update(
        await updateBehaviourPolicySchema.parseAsync(body),
        this.actor(),
      );
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new BadRequestException(error.flatten());
      }
      throw error;
    }
  }

  @Get()
  @RequirePermission("ace.behaviour.read")
  async listEntries(@Query() query: unknown) {
    try {
      return await this.queryService.list(
        this.actor(),
        await behaviourListQuerySchema.parseAsync(query),
      );
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new BadRequestException(error.flatten());
      }
      throw error;
    }
  }

  @Post()
  @RequirePermission("ace.behaviour.record")
  async recordEntry(@Body() body: unknown) {
    try {
      return await this.commandService.record(
        await createBehaviourEntrySchema.parseAsync(body),
        this.actor(),
      );
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new BadRequestException(error.flatten());
      }
      throw error;
    }
  }

  @Post(":id/corrections")
  @RequirePermission("ace.behaviour.record")
  async correctEntry(@Param("id") id: string, @Body() body: unknown) {
    try {
      return await this.commandService.correct(
        id,
        await behaviourCorrectionSchema.parseAsync(body),
        this.actor(),
      );
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
