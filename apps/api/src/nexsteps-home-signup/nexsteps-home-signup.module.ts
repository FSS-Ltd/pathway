import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { NexstepsHomeSignupController } from "./nexsteps-home-signup.controller";
import { NexstepsHomeSignupService } from "./nexsteps-home-signup.service";

@Module({
  imports: [AuthModule],
  controllers: [NexstepsHomeSignupController],
  providers: [NexstepsHomeSignupService],
})
export class NexstepsHomeSignupModule {}
