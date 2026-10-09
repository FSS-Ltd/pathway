import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Query,
  UseGuards,
} from "@nestjs/common";
import { PathwayRequestContext } from "@pathway/auth";
import { z } from "zod";
import { PermissionGuard } from "../access-control/permission.guard";
import { RequirePermission } from "../access-control/require-permission.decorator";
import { AuthUserGuard } from "../auth/auth-user.guard";
import {
  paceInventoryOrdersQuerySchema,
  paceInventoryStockQuerySchema,
} from "./dto/pace-inventory-query.dto";
import { PaceInventoryQueryService } from "./pace-inventory-query.service";

@UseGuards(AuthUserGuard, PermissionGuard)
@Controller("ace/pace/inventory")
export class PaceInventoryController {
  constructor(
    @Inject(PaceInventoryQueryService)
    private readonly service: PaceInventoryQueryService,
    @Inject(PathwayRequestContext)
    private readonly requestContext: PathwayRequestContext,
  ) {}

  @Get("orders")
  @RequirePermission("ace.pace.inventory.read")
  async orders(@Query() query: unknown) {
    try {
      return await this.service.listOrders(
        this.actor(),
        await paceInventoryOrdersQuerySchema.parseAsync(query),
      );
    } catch (error) {
      if (error instanceof z.ZodError)
        throw new BadRequestException(error.flatten());
      throw error;
    }
  }

  @Get("stock")
  @RequirePermission("ace.pace.inventory.read")
  async stock(@Query() query: unknown) {
    try {
      return await this.service.listStock(
        this.actor(),
        await paceInventoryStockQuerySchema.parseAsync(query),
      );
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
