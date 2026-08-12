import { Module } from "@nestjs/common";
import { AccessControlModule } from "../access-control/access-control.module";
import { AuthModule } from "../auth/auth.module";
import { CommonModule } from "../common/common.module";
import { AceDashboardController } from "./ace-dashboard.controller";
import { AceDashboardService } from "./ace-dashboard.service";

@Module({
  imports: [CommonModule, AuthModule, AccessControlModule],
  controllers: [AceDashboardController],
  providers: [AceDashboardService],
})
export class AceDashboardModule {}
