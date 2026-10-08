import { Module } from "@nestjs/common";
import { AccessControlModule } from "../access-control/access-control.module";
import { CommonModule } from "../common/common.module";
import { AuthModule } from "../auth/auth.module";
import { SafeguardingModule } from "../common/safeguarding/safeguarding.module";
import { DsarController } from "./dsar.controller";
import { DsarService } from "./dsar.service";

@Module({
  imports: [CommonModule, SafeguardingModule, AuthModule, AccessControlModule],
  controllers: [DsarController],
  providers: [DsarService],
  exports: [DsarService],
})
export class DsarModule {}
