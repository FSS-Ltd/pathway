import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { MailerModule } from "../mailer/mailer.module";
import { FeedbackController } from "./feedback.controller";
import { FeedbackService } from "./feedback.service";

@Module({
  imports: [AuthModule, MailerModule],
  controllers: [FeedbackController],
  providers: [FeedbackService],
})
export class FeedbackModule {}
