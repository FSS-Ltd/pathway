import { Module, forwardRef } from "@nestjs/common";
import { InvitesController } from "./invites.controller";
import { InvitesService } from "./invites.service";
import { AuthModule } from "../auth/auth.module";
import { MailerModule } from "../mailer/mailer.module";
import { CommonModule } from "../common/common.module";

@Module({
  imports: [forwardRef(() => AuthModule), MailerModule, CommonModule],
  controllers: [InvitesController],
  providers: [InvitesService],
  exports: [InvitesService],
})
export class InvitesModule {}

