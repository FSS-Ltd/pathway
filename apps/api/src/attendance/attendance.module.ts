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

@Module({
  imports: [CommonModule, Av30Module, AuthModule, AccessControlModule],
  controllers: [DailyAttendanceController, AttendanceController],
  providers: [
    AttendanceService,
    AttendanceHistoryService,
    DailyAttendanceService,
  ],
  exports: [AttendanceService],
})
export class AttendanceModule {}
