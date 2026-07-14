import { Module } from "@nestjs/common";
import { GuestPassController } from "./guest-pass.controller";
import { GuestPassPublicController } from "./guest-pass-public.controller";
import { GuestPassService } from "./guest-pass.service";
import { AuthModule } from "../auth/auth.module";
import { PublicSignupModule } from "../public-signup/public-signup.module";

@Module({
  imports: [AuthModule, PublicSignupModule],
  controllers: [GuestPassController, GuestPassPublicController],
  providers: [GuestPassService],
  exports: [GuestPassService],
})
export class GuestPassModule {}
