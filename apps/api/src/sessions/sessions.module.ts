import { Module } from "@nestjs/common";
import { CommonModule } from "../common/common.module";
import { AuthModule } from "../auth/auth.module";
import { BillingModule } from "../billing/billing.module";
import { SessionsController } from "./sessions.controller";
import { SessionsService } from "./sessions.service";
import { StaffAttendanceService } from "./staff-attendance.service";
import { RotaAccessService } from "./rota-access.service";
import { FamilyTimetableService } from "./family-timetable.service";
import { FamilySubjectTimetableService } from "./family-subject-timetable.service";
import {
  ParentSubjectTimetableController,
  StudentSubjectTimetableController,
} from "./family-subject-timetable.controller";
import {
  ParentTimetableController,
  StudentTimetableController,
} from "./family-timetable.controller";

@Module({
  imports: [CommonModule, BillingModule, AuthModule],
  controllers: [
    SessionsController,
    ParentTimetableController,
    StudentTimetableController,
    ParentSubjectTimetableController,
    StudentSubjectTimetableController,
  ],
  providers: [
    SessionsService,
    StaffAttendanceService,
    RotaAccessService,
    FamilyTimetableService,
    FamilySubjectTimetableService,
  ],
  exports: [SessionsService, StaffAttendanceService],
})
export class SessionsModule {}
