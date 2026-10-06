import { Module } from "@nestjs/common";
import { AccessControlModule } from "../access-control/access-control.module";
import { AuthModule } from "../auth/auth.module";
import { CommonModule } from "../common/common.module";
import { StudentSubjectsController } from "./student-subjects.controller";
import { StudentSubjectsService } from "./student-subjects.service";
import { PaceController } from "./pace.controller";
import { PaceQueryService } from "./pace-query.service";
import { PaceCommandService } from "./pace-command.service";
import { PaceExceptionsService } from "./pace-exceptions.service";
import { PaceInventoryController } from "./pace-inventory.controller";
import { PaceInventoryQueryService } from "./pace-inventory-query.service";
import { PaceInventoryCommandsController } from "./pace-inventory-commands.controller";
import { PaceInventoryOrderCommandService } from "./pace-inventory-order-command.service";
import { PaceInventoryStockCommandService } from "./pace-inventory-stock-command.service";
import { PaceInventoryOrderStatusService } from "./pace-inventory-order-status.service";

@Module({
  imports: [CommonModule, AuthModule, AccessControlModule],
  controllers: [
    StudentSubjectsController,
    PaceController,
    PaceInventoryController,
    PaceInventoryCommandsController,
  ],
  providers: [
    StudentSubjectsService,
    PaceQueryService,
    PaceCommandService,
    PaceExceptionsService,
    PaceInventoryQueryService,
    PaceInventoryOrderCommandService,
    PaceInventoryStockCommandService,
    PaceInventoryOrderStatusService,
  ],
})
export class PaceModule {}
