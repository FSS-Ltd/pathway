import { Module } from "@nestjs/common";
import { CommonModule } from "../common/common.module";
import { Av30Module } from "../av30/av30.module";
import { AuthModule } from "../auth/auth.module";
import { AccessControlModule } from "../access-control/access-control.module";
import { AttendanceController } from "./attendance.controller";
import { AttendanceService } from "./attendance.service";
import { AttendanceHistoryService } from "./attendance-history.service";
import { DailyAttendanceController } from "./daily-attendance.controller";
import { DailyAttendanceService } from "./daily-attendance.service";
import { DailyAttendanceExportService } from "./daily-attendance-export.service";
import { DailyAttendanceHistoryService } from "./daily-attendance-history.service";
import { DailyAttendanceWriteService } from "./daily-attendance-write.service";
import { StudentDailyAttendanceController } from "./student-daily-attendance.controller";
import { StudentDailyAttendanceService } from "./student-daily-attendance.service";
import { ParentDailyAttendanceController } from "./parent-daily-attendance.controller";
import { ParentDailyAttendanceService } from "./parent-daily-attendance.service";
import { FamilyContextsController } from "./family-contexts.controller";
import { FamilyContextsService } from "./family-contexts.service";

@Module({
  imports: [CommonModule, Av30Module, AuthModule, AccessControlModule],
  controllers: [
    DailyAttendanceController,
    StudentDailyAttendanceController,
    ParentDailyAttendanceController,
    FamilyContextsController,
    AttendanceController,
  ],
  providers: [
    AttendanceService,
    AttendanceHistoryService,
    DailyAttendanceService,
    DailyAttendanceExportService,
    DailyAttendanceHistoryService,
    DailyAttendanceWriteService,
    StudentDailyAttendanceService,
    ParentDailyAttendanceService,
    FamilyContextsService,
  ],
  exports: [AttendanceService],
})
export class AttendanceModule {}
