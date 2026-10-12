import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { EnrolmentsController } from "./enrolments.controller";
import { EnrolmentIdentitiesService } from "./enrolment-identities.service";
import { EnrolmentRollService } from "./enrolment-roll.service";

@Module({
  imports: [AuthModule],
  controllers: [EnrolmentsController],
  providers: [EnrolmentIdentitiesService, EnrolmentRollService],
})
export class EnrolmentsModule {}
