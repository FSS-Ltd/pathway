import { Module } from "@nestjs/common";
import { AccessControlModule } from "../access-control/access-control.module";
import { AuthModule } from "../auth/auth.module";
import { CommonModule } from "../common/common.module";
import { ComplianceController } from "./compliance.controller";
import { ComplianceService } from "./compliance.service";

import { MedicalController } from "./medical.controller";
import { MedicalService } from "./medical.service";

@Module({
  imports: [CommonModule, AuthModule, AccessControlModule],
  controllers: [ComplianceController, MedicalController],
  providers: [ComplianceService, MedicalService],
})
export class ComplianceModule {}
