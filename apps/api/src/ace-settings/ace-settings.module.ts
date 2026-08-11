import { Module } from "@nestjs/common";
import { AccessControlModule } from "../access-control/access-control.module";
import { AuthModule } from "../auth/auth.module";
import { CommonModule } from "../common/common.module";
import { AceSettingsController } from "./ace-settings.controller";
import { AceSettingsService } from "./ace-settings.service";

@Module({
  imports: [CommonModule, AuthModule, AccessControlModule],
  controllers: [AceSettingsController],
  providers: [AceSettingsService],
})
export class AceSettingsModule {}
