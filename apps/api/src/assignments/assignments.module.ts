import { Module } from "@nestjs/common";
import { CommonModule } from "../common/common.module";
import { AuthModule } from "../auth/auth.module";
import { Av30Module } from "../av30/av30.module";
import { BillingModule } from "../billing/billing.module";
import { MailerModule } from "../mailer/mailer.module";
import { AssignmentsController } from "./assignments.controller";
import { AssignmentsService } from "./assignments.service";

@Module({
  imports: [CommonModule, Av30Module, BillingModule, AuthModule, MailerModule],
  controllers: [AssignmentsController],
  providers: [AssignmentsService],
  exports: [AssignmentsService],
})
export class AssignmentsModule {}
