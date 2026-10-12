import { Module } from "@nestjs/common";
import { CommonModule } from "../common/common.module";
import { AuthModule } from "../auth/auth.module";
import { BillingModule } from "../billing/billing.module";
import { SessionsController } from "./sessions.controller";
import { SessionsService } from "./sessions.service";
import { StaffAttendanceService } from "./staff-attendance.service";

@Module({
  imports: [CommonModule, BillingModule, AuthModule],
  controllers: [SessionsController],
  providers: [SessionsService, StaffAttendanceService],
  exports: [SessionsService, StaffAttendanceService],
})
export class SessionsModule {}
