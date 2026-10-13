import { Controller, Get, Headers, Inject } from "@nestjs/common";
import { requireCronAuthorization } from "../common/cron-authorization";
import { AceNoticeScheduleRunnerService } from "./ace-notice-schedule-runner.service";

@Controller("internal/notice-schedules")
export class AceNoticeScheduleRunnerController {
  constructor(
    @Inject(AceNoticeScheduleRunnerService)
    private readonly runner: AceNoticeScheduleRunnerService,
  ) {}

  @Get("run")
  run(@Headers("authorization") authorization?: string) {
    requireCronAuthorization(authorization);
    return this.runner.runDue();
  }
}
