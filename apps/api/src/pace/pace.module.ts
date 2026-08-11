import { Module } from "@nestjs/common";
import { AccessControlModule } from "../access-control/access-control.module";
import { AuthModule } from "../auth/auth.module";
import { CommonModule } from "../common/common.module";
import { StudentSubjectsController } from "./student-subjects.controller";
import { StudentSubjectsService } from "./student-subjects.service";

@Module({
  imports: [CommonModule, AuthModule, AccessControlModule],
  controllers: [StudentSubjectsController],
  providers: [StudentSubjectsService],
})
export class PaceModule {}
