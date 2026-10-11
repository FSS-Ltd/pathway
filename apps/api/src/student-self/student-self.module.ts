import { Module } from "@nestjs/common";
import { AttendanceModule } from "../attendance/attendance.module";
import { AuthModule } from "../auth/auth.module";
import { CommonModule } from "../common/common.module";
import { StudentSelfController } from "./student-self.controller";
import { StudentSelfService } from "./student-self.service";

@Module({
  imports: [CommonModule, AuthModule, AttendanceModule],
  controllers: [StudentSelfController],
  providers: [StudentSelfService],
})
export class StudentSelfModule {}
