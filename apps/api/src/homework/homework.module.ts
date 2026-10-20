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
import { HomeworkReviewController } from "./homework-review.controller";
import { HomeworkReviewService } from "./homework-review.service";
import { HomeworkGuardianController } from "./homework-guardian.controller";
import { HomeworkGuardianService } from "./homework-guardian.service";
import { MailerModule } from "../mailer/mailer.module";
import { HomeworkEmailRunnerController } from "./homework-email-runner.controller";
import { HomeworkEmailRunnerService } from "./homework-email-runner.service";

@Module({
  imports: [CommonModule, AuthModule, AccessControlModule, MailerModule],
  controllers: [
    HomeworkController,
    HomeworkScheduleRunnerController,
    HomeworkStudentController,
    HomeworkReviewController,
    HomeworkGuardianController,
    HomeworkEmailRunnerController,
  ],
  providers: [
    HomeworkService,
    HomeworkScheduleRunnerService,
    HomeworkSubmissionService,
    HomeworkEvidenceService,
    HomeworkMalwareScanner,
    HomeworkReviewService,
    HomeworkGuardianService,
    HomeworkEmailRunnerService,
  ],
})
export class HomeworkModule {}
