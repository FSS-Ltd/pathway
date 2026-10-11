import { Module } from "@nestjs/common";
import { AceNoticesModule } from "../ace-notices/ace-notices.module";
import { AttendanceModule } from "../attendance/attendance.module";
import { AuthModule } from "../auth/auth.module";
import { CommonModule } from "../common/common.module";
import { MessagingModule } from "../messaging/messaging.module";
import { FamilyController } from "./family.controller";
import { FamilyService } from "./family.service";

@Module({
  imports: [
    CommonModule,
    AuthModule,
    AttendanceModule,
    AceNoticesModule,
    MessagingModule,
  ],
  controllers: [FamilyController],
  providers: [FamilyService],
})
export class FamilyModule {}
