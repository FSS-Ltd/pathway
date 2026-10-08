import { Module } from "@nestjs/common";
import { PathwayAuthModule } from "@pathway/auth";
import { AccessControlModule } from "../../access-control/access-control.module";
import { SafeguardingGuard } from "./safeguarding.guard";

@Module({
  imports: [PathwayAuthModule, AccessControlModule],
  providers: [SafeguardingGuard],
  exports: [SafeguardingGuard],
})
export class SafeguardingModule {}
