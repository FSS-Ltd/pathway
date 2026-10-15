import { TrackerHistoryService } from "./tracker-history.service";
import { TrackerCatalogueService } from "./catalogue/catalogue.service";
import { TrackerSignalsService } from "./tracker-signals.service";
import { TrackerAccessService } from "./tracker-access";
import { TrackerFiles } from "./tracker-files";
import { TrackerEvidenceService } from "./tracker-evidence.service";
import { TrackerProfileService } from "./tracker-profile.service";
import { TrackerService } from "./tracker.service";
import { TrackerController } from "./tracker.controller";
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
  controllers: [
    TrackerController,
    ComplianceController,
    MedicalController,
    AgreementsController,
  ],
  providers: [
    TrackerHistoryService,
    TrackerService,
    TrackerProfileService,
    TrackerEvidenceService,
    TrackerFiles,
    TrackerAccessService,
    TrackerSignalsService,
    TrackerCatalogueService,

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
