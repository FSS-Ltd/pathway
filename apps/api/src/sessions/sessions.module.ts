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
import { SchoolVolunteeringService } from "./school-volunteering.service";
import {
  ParentSchoolVolunteeringController,
  StaffSchoolVolunteeringController,
} from "./school-volunteering.controller";
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
    ParentSchoolVolunteeringController,
    StaffSchoolVolunteeringController,
  ],
  providers: [
    SessionsService,
    StaffAttendanceService,
    RotaAccessService,
    FamilyTimetableService,
    FamilySubjectTimetableService,
    SchoolVolunteeringService,
  ],
  exports: [SessionsService, StaffAttendanceService],
})
export class SessionsModule {}
