import { Module } from "@nestjs/common";
import { AccessControlModule } from "../access-control/access-control.module";
import { AuthModule } from "../auth/auth.module";
import { CommonModule } from "../common/common.module";
import { HomeworkController } from "./homework.controller";
import { HomeworkService } from "./homework.service";
import { HomeworkScheduleRunnerController } from "./homework-schedule-runner.controller";
import { HomeworkScheduleRunnerService } from "./homework-schedule-runner.service";

@Module({
  imports: [CommonModule, AuthModule, AccessControlModule],
  controllers: [HomeworkController, HomeworkScheduleRunnerController],
  providers: [HomeworkService, HomeworkScheduleRunnerService],
})
export class HomeworkModule {}
