import { Module } from "@nestjs/common";
import { CommonModule } from "../common/common.module";
import { AuthModule } from "../auth/auth.module";
import { PublicSignupModule } from "../public-signup/public-signup.module";
import { AccessControlModule } from "../access-control/access-control.module";
import { GuardianAccessReviewController } from "./guardian-access-review.controller";
import { GuardianAccessReviewService } from "./guardian-access-review.service";
import { ParentsController } from "./parents.controller";
import { ParentsService } from "./parents.service";

@Module({
  imports: [CommonModule, AuthModule, PublicSignupModule, AccessControlModule],
  controllers: [ParentsController, GuardianAccessReviewController],
  providers: [ParentsService, GuardianAccessReviewService],
  exports: [ParentsService],
})
export class ParentsModule {}
