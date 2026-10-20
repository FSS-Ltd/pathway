import { Controller, Get, Headers, Inject } from "@nestjs/common";
import { requireCronAuthorization } from "../common/cron-authorization";
import { HomeworkEmailRunnerService } from "./homework-email-runner.service";

@Controller("internal/homework-email")
export class HomeworkEmailRunnerController {
  constructor(
    @Inject(HomeworkEmailRunnerService)
    private readonly runner: HomeworkEmailRunnerService,
  ) {}

  @Get("run")
  run(@Headers("authorization") authorization?: string) {
    requireCronAuthorization(authorization);
    return this.runner.runDue();
  }
}
