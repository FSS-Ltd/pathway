import { Controller, Get, Headers, Inject } from "@nestjs/common";
import { requireCronAuthorization } from "../common/cron-authorization";
import { PermissionSlipScheduleRunnerService } from "./permission-slip-schedule-runner.service";

@Controller("internal/permission-slip-schedules")
export class PermissionSlipScheduleRunnerController {
  constructor(
    @Inject(PermissionSlipScheduleRunnerService)
    private readonly runner: PermissionSlipScheduleRunnerService,
  ) {}

  @Get("run")
  run(@Headers("authorization") authorization?: string) {
    requireCronAuthorization(authorization);
    return this.runner.runDue();
  }
}
