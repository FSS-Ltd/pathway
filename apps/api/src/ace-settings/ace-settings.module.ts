import { Module } from "@nestjs/common";
import { AccessControlModule } from "../access-control/access-control.module";
import { AuthModule } from "../auth/auth.module";
import { CommonModule } from "../common/common.module";
import { AcademicCalendarController } from "./academic-calendar.controller";
import { AcademicCalendarService } from "./academic-calendar.service";
import { AceSettingsController } from "./ace-settings.controller";
import { AceSettingsService } from "./ace-settings.service";

@Module({
  imports: [CommonModule, AuthModule, AccessControlModule],
  controllers: [AceSettingsController, AcademicCalendarController],
  providers: [AceSettingsService, AcademicCalendarService],
})
export class AceSettingsModule {}
