import { Module } from "@nestjs/common";
import { AccessControlModule } from "../access-control/access-control.module";
import { AuthModule } from "../auth/auth.module";
import { CommonModule } from "../common/common.module";
import { MailerModule } from "../mailer/mailer.module";
import {
  GuardianInvitesAcceptanceController,
  GuardianInvitesStaffController,
} from "./family-invites.controller";
import { FamilyInvitesService } from "./family-invites.service";
import { GuardianInviteAcceptanceService } from "./guardian-invite-acceptance.service";

@Module({
  imports: [CommonModule, AuthModule, AccessControlModule, MailerModule],
  controllers: [
    GuardianInvitesStaffController,
    GuardianInvitesAcceptanceController,
  ],
  providers: [FamilyInvitesService, GuardianInviteAcceptanceService],
})
export class FamilyInvitesModule {}
