import { Module } from "@nestjs/common";
import { AccessControlModule } from "../access-control/access-control.module";
import { AuthModule } from "../auth/auth.module";
import { CommonModule } from "../common/common.module";
import { FaithController } from "./faith.controller";
import { FaithFeedController } from "./faith-feed.controller";
import { FaithReflectionController } from "./faith-reflection.controller";
import { FaithReflectionService } from "./faith-reflection.service";
import { FaithScheduleRunnerController } from "./faith-schedule-runner.controller";
import { FaithScheduleRunnerService } from "./faith-schedule-runner.service";
import { FaithService } from "./faith.service";

@Module({
  imports: [CommonModule, AuthModule, AccessControlModule],
  controllers: [
    FaithController,
    FaithFeedController,
    FaithReflectionController,
    FaithScheduleRunnerController,
  ],
  providers: [FaithService, FaithReflectionService, FaithScheduleRunnerService],
})
export class FaithModule {}
