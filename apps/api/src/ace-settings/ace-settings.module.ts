import { Module } from "@nestjs/common";
import { AccessControlModule } from "../access-control/access-control.module";
import { AuthModule } from "../auth/auth.module";
import { CommonModule } from "../common/common.module";
import { AcademicCalendarController } from "./academic-calendar.controller";
import { AcademicCalendarService } from "./academic-calendar.service";
import { AceSubjectsController } from "./ace-subjects.controller";
import { AceSubjectsService } from "./ace-subjects.service";
import { AceSubjectTimetableController } from "./ace-subject-timetable.controller";
import { AceSubjectTimetableDraftService } from "./ace-subject-timetable-draft.service";
import { AceSubjectTimetablePublicationService } from "./ace-subject-timetable-publication.service";
import { AceSubjectTimetableScheduleService } from "./ace-subject-timetable-schedule.service";
import { AceSettingsController } from "./ace-settings.controller";
import { AceSettingsService } from "./ace-settings.service";

@Module({
  imports: [CommonModule, AuthModule, AccessControlModule],
  controllers: [
    AceSettingsController,
    AcademicCalendarController,
    AceSubjectsController,
    AceSubjectTimetableController,
  ],
  providers: [
    AceSettingsService,
    AcademicCalendarService,
    AceSubjectsService,
    AceSubjectTimetableDraftService,
    AceSubjectTimetablePublicationService,
    AceSubjectTimetableScheduleService,
  ],
})
export class AceSettingsModule {}
