import { AgreementAccessService } from "./agreement-access";
import { AgreementFiles } from "./agreement-files";
import { AgreementPublicationService } from "./agreement-publication.service";
import { AgreementAcceptanceService } from "./agreement-acceptance.service";
import { AgreementsService } from "./agreements.service";
import { AgreementsController } from "./agreements.controller";
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
  controllers: [ComplianceController, MedicalController, AgreementsController],
  providers: [
    ComplianceService,
    MedicalService,
    AgreementAccessService,
    AgreementFiles,
    AgreementPublicationService,
    AgreementAcceptanceService,
    AgreementsService,
  ],
})
export class ComplianceModule {}
