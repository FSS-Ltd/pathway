import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UseGuards,
} from "@nestjs/common";
import { PathwayRequestContext } from "@pathway/auth";
import { z } from "zod";
import { PermissionGuard } from "../access-control/permission.guard";
import { RequirePermission } from "../access-control/require-permission.decorator";
import { AuthUserGuard } from "../auth/auth-user.guard";
import { createPaceInventoryOrdersSchema } from "./dto/create-pace-inventory-orders.dto";
import { PaceInventoryOrderCommandService } from "./pace-inventory-order-command.service";

@UseGuards(AuthUserGuard, PermissionGuard)
@Controller("ace/pace/inventory")
export class PaceInventoryCommandsController {
  constructor(
    private readonly service: PaceInventoryOrderCommandService,
    private readonly requestContext: PathwayRequestContext,
  ) {}

  @Post("orders")
  @RequirePermission("ace.pace.inventory.manage")
  async createOrders(@Body() body: unknown) {
    let command;
    try {
      command = createPaceInventoryOrdersSchema.parse(body);
    } catch (error) {
      if (error instanceof z.ZodError)
        throw new BadRequestException(error.flatten());
      throw error;
    }

    const context = this.requestContext.requireContext();
    return this.service.createOrders(
      {
        tenantId: context.tenant.tenantId,
        orgId: context.org.orgId,
        userId: context.user.userId,
      },
      command,
    );
  }
}
