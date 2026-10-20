import { Controller, Get, Headers, Inject } from "@nestjs/common";
import { requireCronAuthorization } from "../common/cron-authorization";
import { HomeworkScheduleRunnerService } from "./homework-schedule-runner.service";

@Controller("internal/homework-schedules")
export class HomeworkScheduleRunnerController {
  constructor(
    @Inject(HomeworkScheduleRunnerService)
    private readonly runner: HomeworkScheduleRunnerService,
  ) {}

  @Get("run")
  run(@Headers("authorization") authorization?: string) {
    requireCronAuthorization(authorization);
    return this.runner.runDue();
  }
}
