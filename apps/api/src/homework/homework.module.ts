import { Module } from "@nestjs/common";
import { AccessControlModule } from "../access-control/access-control.module";
import { AuthModule } from "../auth/auth.module";
import { CommonModule } from "../common/common.module";
import { HomeworkController } from "./homework.controller";
import { HomeworkService } from "./homework.service";
import { HomeworkScheduleRunnerController } from "./homework-schedule-runner.controller";
import { HomeworkScheduleRunnerService } from "./homework-schedule-runner.service";
import { HomeworkStudentController } from "./homework-student.controller";
import { HomeworkSubmissionService } from "./homework-submission.service";
import { HomeworkEvidenceService } from "./homework-evidence.service";
import { HomeworkMalwareScanner } from "../storage/homework-malware-scanner";

@Module({
  imports: [CommonModule, AuthModule, AccessControlModule],
  controllers: [
    HomeworkController,
    HomeworkScheduleRunnerController,
    HomeworkStudentController,
  ],
  providers: [
    HomeworkService,
    HomeworkScheduleRunnerService,
    HomeworkSubmissionService,
    HomeworkEvidenceService,
    HomeworkMalwareScanner,
  ],
})
export class HomeworkModule {}
