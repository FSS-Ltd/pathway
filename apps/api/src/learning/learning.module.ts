import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CommonModule } from "../common/common.module";
import { PlatformModule } from "../platform/platform.module";
import { LearningController } from "./learning.controller";
import { LearningService } from "./learning.service";

@Module({
  imports: [CommonModule, AuthModule, PlatformModule],
  controllers: [LearningController],
  providers: [LearningService],
})
export class LearningModule {}
