import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Put,
  UseGuards,
} from "@nestjs/common";
import { PathwayRequestContext } from "@pathway/auth";
import { z } from "zod";
import { PermissionGuard } from "../access-control/permission.guard";
import { RequirePermission } from "../access-control/require-permission.decorator";
import { AuthUserGuard } from "../auth/auth-user.guard";
import { BehaviourPolicyService } from "./behaviour-policy.service";
import { updateBehaviourPolicySchema } from "./dto/behaviour-policy.dto";

@UseGuards(AuthUserGuard, PermissionGuard)
@Controller("ace/behaviour")
export class BehaviourController {
  constructor(
    private readonly service: BehaviourPolicyService,
    private readonly requestContext: PathwayRequestContext,
  ) {}

  @Get("policy")
  @RequirePermission("ace.behaviour.read")
  get() {
    return this.service.get(this.actor());
  }

  @Put("policy")
  @RequirePermission("ace.behaviour.policy.manage")
  async update(@Body() body: unknown) {
    try {
      return await this.service.update(
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

  private actor() {
    const context = this.requestContext.requireContext();
    return {
      tenantId: context.tenant.tenantId,
      orgId: context.org.orgId,
      userId: context.user.userId,
    };
  }
}
