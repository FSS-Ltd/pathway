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
import {
  StudentInvitesAcceptanceController,
  StudentInvitesStaffController,
} from "./student-invites.controller";
import { StudentInvitesService } from "./student-invites.service";
import { StudentInviteAcceptanceService } from "./student-invite-acceptance.service";
import { StudentPortalPolicyService } from "./student-portal-policy.service";
import { StudentAccessService } from "./student-access.service";
import { FamilyIdentityImportController } from "./family-identity-import.controller";
import { FamilyIdentityImportService } from "./family-identity-import.service";

@Module({
  imports: [CommonModule, AuthModule, AccessControlModule, MailerModule],
  controllers: [
    GuardianInvitesStaffController,
    GuardianInvitesAcceptanceController,
    StudentInvitesStaffController,
    StudentInvitesAcceptanceController,
    FamilyIdentityImportController,
  ],
  providers: [
    FamilyInvitesService,
    GuardianInviteAcceptanceService,
    StudentInvitesService,
    StudentInviteAcceptanceService,
    StudentPortalPolicyService,
    StudentAccessService,
    FamilyIdentityImportService,
  ],
})
export class FamilyInvitesModule {}
