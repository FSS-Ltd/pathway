import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CommonModule } from "../common/common.module";
import { PlatformModule } from "../platform/platform.module";
import { FamilyPlannerController } from "./family-planner.controller";
import { FamilyPlannerService } from "./family-planner.service";

@Module({
  imports: [CommonModule, AuthModule, PlatformModule],
  controllers: [FamilyPlannerController],
  providers: [FamilyPlannerService],
})
export class FamilyPlannerModule {}
