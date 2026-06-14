import { Module } from "@nestjs/common";
import { PublicSignupController } from "./public-signup.controller";
import { PublicSignupService } from "./public-signup.service";
import { MailerModule } from "../mailer/mailer.module";
import { AuthModule } from "../auth/auth.module";
import { CommonModule } from "../common/common.module";

@Module({
  imports: [MailerModule, AuthModule, CommonModule],
  controllers: [PublicSignupController],
  providers: [PublicSignupService],
  exports: [PublicSignupService],
})
export class PublicSignupModule {}
