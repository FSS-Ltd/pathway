import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CommonModule } from "../common/common.module";
import { NexstepsHomeSignupController } from "./nexsteps-home-signup.controller";
import { NexstepsHomeSignupService } from "./nexsteps-home-signup.service";

@Module({
  imports: [AuthModule, CommonModule],
  controllers: [NexstepsHomeSignupController],
  providers: [NexstepsHomeSignupService],
})
export class NexstepsHomeSignupModule {}
