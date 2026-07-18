import { Module } from "@nestjs/common";
import { PathwayAuthModule } from "@pathway/auth";
import { AuthModule } from "../auth/auth.module";
import { CapabilityGuard } from "./capability.guard";
import { PlatformController } from "./platform.controller";

@Module({
  imports: [PathwayAuthModule, AuthModule],
  controllers: [PlatformController],
  providers: [CapabilityGuard],
  exports: [CapabilityGuard],
})
export class PlatformModule {}
