import {
  BadRequestException,
  Body,
  Controller,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { PathwayRequestContext } from "@pathway/auth";
import { z } from "zod";
import { PermissionGuard } from "../access-control/permission.guard";
import { RequirePermission } from "../access-control/require-permission.decorator";
import { AuthUserGuard } from "../auth/auth-user.guard";
import { advancePaceInventoryOrderSchema } from "./dto/advance-pace-inventory-order.dto";
import {
  paceInventoryBulkSchema,
  type PaceInventoryBulkDto,
} from "./dto/pace-inventory-bulk.dto";
import { PaceInventoryOrderCommandService } from "./pace-inventory-order-command.service";
import { PaceInventoryOrderStatusService } from "./pace-inventory-order-status.service";
import { PaceInventoryStockCommandService } from "./pace-inventory-stock-command.service";

@UseGuards(AuthUserGuard, PermissionGuard)
@Controller("ace/pace/inventory")
export class PaceInventoryCommandsController {
  constructor(
    private readonly orderService: PaceInventoryOrderCommandService,
    private readonly statusService: PaceInventoryOrderStatusService,
    private readonly stockService: PaceInventoryStockCommandService,
    private readonly requestContext: PathwayRequestContext,
  ) {}

  @Post("orders")
  @RequirePermission("ace.pace.inventory.manage")
  async createOrders(@Body() body: unknown) {
    return this.orderService.createOrders(this.actor(), this.parse(body));
  }

  @Post("stock")
  @RequirePermission("ace.pace.inventory.manage")
  async addCurrentStock(@Body() body: unknown) {
    return this.stockService.addCurrentStock(this.actor(), this.parse(body));
  }

  @Patch("orders/:orderId/status")
  @RequirePermission("ace.pace.inventory.manage")
  async advanceOrder(
    @Param("orderId") orderId: unknown,
    @Body() body: unknown,
  ) {
    try {
      const id = z.string().uuid().parse(orderId);
      const command = advancePaceInventoryOrderSchema.parse(body);
      return this.statusService.advance(this.actor(), id, command);
    } catch (error) {
      if (error instanceof z.ZodError)
        throw new BadRequestException(error.flatten());
      throw error;
    }
  }

  private parse(body: unknown): PaceInventoryBulkDto {
    try {
      return paceInventoryBulkSchema.parse(body);
    } catch (error) {
      if (error instanceof z.ZodError)
        throw new BadRequestException(error.flatten());
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
