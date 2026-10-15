import { Controller, Get, Headers, Inject } from "@nestjs/common";
import { requireCronAuthorization } from "../common/cron-authorization";
import { MessageEmailRunnerService } from "./message-email-runner.service";

@Controller("internal/message-email")
export class MessageEmailRunnerController {
  constructor(
    @Inject(MessageEmailRunnerService)
    private readonly runner: MessageEmailRunnerService,
  ) {}

  @Get("run")
  run(@Headers("authorization") authorization?: string) {
    requireCronAuthorization(authorization);
    return this.runner.runDue();
  }
}
