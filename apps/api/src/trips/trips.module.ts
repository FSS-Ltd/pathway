import { Module } from "@nestjs/common";
import { AccessControlModule } from "../access-control/access-control.module";
import { AuthModule } from "../auth/auth.module";
import { CommonModule } from "../common/common.module";
import { PermissionSlipScheduleRunnerController } from "./permission-slip-schedule-runner.controller";
import { PermissionSlipScheduleRunnerService } from "./permission-slip-schedule-runner.service";
import { PermissionSlipVersionService } from "./permission-slip-version.service";
import { PermissionSlipDraftService } from "./permission-slip-draft.service";
import { PermissionSlipResponseController } from "./permission-slip-response.controller";
import { PermissionSlipResponseService } from "./permission-slip-response.service";
import { PermissionSlipExceptionService } from "./permission-slip-exception.service";
import { TripsController } from "./trips.controller";
import { TripsService } from "./trips.service";

@Module({
  imports: [CommonModule, AuthModule, AccessControlModule],
  controllers: [
    TripsController,
    PermissionSlipResponseController,
    PermissionSlipScheduleRunnerController,
  ],
  providers: [
    TripsService,
    PermissionSlipDraftService,
    PermissionSlipVersionService,
    PermissionSlipResponseService,
    PermissionSlipExceptionService,
    PermissionSlipScheduleRunnerService,
  ],
})
export class TripsModule {}
