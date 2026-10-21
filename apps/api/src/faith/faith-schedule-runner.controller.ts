import { Controller, Get, Headers, Inject } from "@nestjs/common";
import { requireCronAuthorization } from "../common/cron-authorization";
import { FaithScheduleRunnerService } from "./faith-schedule-runner.service";

@Controller("internal/faith-schedules")
export class FaithScheduleRunnerController {
  constructor(
    @Inject(FaithScheduleRunnerService)
    private readonly runner: FaithScheduleRunnerService,
  ) {}

  @Get("run")
  run(@Headers("authorization") authorization?: string) {
    requireCronAuthorization(authorization);
    return this.runner.runDue();
  }
}
