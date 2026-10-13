import { Module } from "@nestjs/common";
import { CommonModule } from "../common/common.module";
import { AuthModule } from "../auth/auth.module";
import { ChildrenController } from "./children.controller";
import { ChildrenService } from "./children.service";
import { AccessControlModule } from "../access-control/access-control.module";
import {
  ParentStudentOverviewController,
  StaffStudentOverviewController,
} from "./student-overview.controller";
import { StudentOverviewService } from "./student-overview.service";

@Module({
  imports: [CommonModule, AuthModule, AccessControlModule],
  controllers: [
    ChildrenController,
    StaffStudentOverviewController,
    ParentStudentOverviewController,
  ],
  providers: [ChildrenService, StudentOverviewService],
  exports: [ChildrenService],
})
export class ChildrenModule {}
