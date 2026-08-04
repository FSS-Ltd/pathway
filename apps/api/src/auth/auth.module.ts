import { Module, forwardRef } from "@nestjs/common";
import { PathwayAuthModule } from "@pathway/auth";
import { ActiveSiteController } from "./active-site.controller";
import { AuthIdentityController } from "./auth-identity.controller";
import { AuthIdentityService } from "./auth-identity.service";
import { AuthMeController } from "./auth-me.controller";
import { AuthUserGuard } from "./auth-user.guard";
import { VerifiedPrincipalGuard } from "./verified-principal.guard";
import { Auth0ManagementService } from "./auth0-management.service";
import { UserRolesService } from "./user-roles.service";
import { InvitesModule } from "../invites/invites.module";

@Module({
  imports: [PathwayAuthModule, forwardRef(() => InvitesModule)],
  providers: [
    AuthIdentityService,
    AuthUserGuard,
    VerifiedPrincipalGuard,
    Auth0ManagementService,
    UserRolesService,
  ],
  controllers: [AuthIdentityController, ActiveSiteController, AuthMeController],
  exports: [
    AuthIdentityService,
    AuthUserGuard,
    VerifiedPrincipalGuard,
    Auth0ManagementService,
    UserRolesService,
  ],
})
export class AuthModule {}
