import { timingSafeEqual } from "node:crypto";
import {
  Controller,
  Get,
  Headers,
  Inject,
  UnauthorizedException,
} from "@nestjs/common";
import { AceNoticeScheduleRunnerService } from "./ace-notice-schedule-runner.service";

function hasValidCronAuthorization(header: string | undefined): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16 || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

@Controller("internal/notice-schedules")
export class AceNoticeScheduleRunnerController {
  constructor(
    @Inject(AceNoticeScheduleRunnerService)
    private readonly runner: AceNoticeScheduleRunnerService,
  ) {}

  @Get("run")
  run(@Headers("authorization") authorization?: string) {
    if (!hasValidCronAuthorization(authorization)) {
      throw new UnauthorizedException();
    }
    return this.runner.runDue();
  }
}
