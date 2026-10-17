import { type TrackerTopic } from "@pathway/types";
import type { CatalogueRequirement, TrackerCatalogue } from "../schema";
import { englandCoverage, englandRequirements, englandSources } from ".";
import { englandReview } from "./shared";
import {
  operationsUpdates,
  operationsUpdateSources,
} from "./operations-updates";
import {
  childcareRouteSources,
  childcareRouteRequirements,
} from "./childcare-routes";
import { stateSchoolSources } from "./state-school-sources";
import { stateSchoolRequirements } from "./state-schools";
import { privacyAdvancedSources } from "./privacy-advanced-sources";
import { privacyAdvancedRequirements } from "./privacy-advanced";
import { operationalDetailSources } from "./operational-detail-sources";
import { premisesDetailRequirements } from "./premises-detail";
import { activityDetailRequirements } from "./activity-detail";
import {
  recordsRouteSources,
  recordsRouteRequirements,
} from "./records-routes";
import { commonOperationsSources } from "./common-operations-sources";
import { commonOperationsRequirements } from "./common-operations";
import { schoolProcedureSources } from "./school-procedure-sources";
import { schoolProcedureRequirements } from "./school-procedures";

const additions: CatalogueRequirement[] = [
  ...stateSchoolRequirements,
  ...privacyAdvancedRequirements,
  ...premisesDetailRequirements,
  ...activityDetailRequirements,
  ...childcareRouteRequirements,
  ...recordsRouteRequirements,
  ...commonOperationsRequirements,
  ...schoolProcedureRequirements,
].map((requirement) => ({
  ...requirement,
  effective: { from: "2026-10-17", to: null },
  materialChangeReason:
    "Additional reviewed England operational checklist action",
}));
export const englandDetailSources: TrackerCatalogue["sources"] = [
  ...englandSources,
  ...stateSchoolSources,
  ...privacyAdvancedSources,
  ...operationalDetailSources,
  ...childcareRouteSources,
  ...recordsRouteSources,
  ...commonOperationsSources,
  ...schoolProcedureSources,
  ...operationsUpdateSources,
];
export const englandDetailRequirements: TrackerCatalogue["requirements"] = [
  ...englandRequirements,
  ...additions,
  ...operationsUpdates,
];
const gaps: Record<TrackerTopic, string> = {
  registration_governance:
    "Reviewed classification, independent-school/EYFS and maintained/academy governance, complaints, publication and admissions routes. Reviewed procedural routes include maintained constitution, admission appeals and actual academy articles assessment. Institution-specific constitutions, funding/registration terms, specialist appeal branches and actual local permissions still require evidence/review.",
  safeguarding:
    "Reviewed school, early-years and community core. Actual local safeguarding-partner/LADO/referral arrangements, relevant-agency designation and denominational/sport/funder conditions require site-specific review; specialist adult services are not covered.",
  personnel:
    "Reviewed school/EYFS core and individual role-check assessment. Actual regulated-activity eligibility, specialist qualifications, disqualification/exemptions, adult regulated services and local/provider terms remain site-specific.",
  privacy_records:
    "Reviewed controller/privacy core and conditional joint-controller, biometric, online-service, PECR, transfer and automated-decision assessments. Reviewed record-specific education access/transfer/retention routes distinguish statutory and guidance periods. Telephone marketing, actual destination approvals and specialist service records/exemptions remain incomplete.",
  premises_safety:
    "Reviewed employer, incident-reporting/equality assessment, school medical/accessibility, asbestos, water, gas, electrical and equipment routes. Actual fire/lease allocations and local permissions require evidence; construction, lifting/pressure systems, pools and specialist regimes are not comprehensively covered.",
  education_childcare:
    "Reviewed independent/maintained/academy curriculum, attendance, SEND/EHCP, group/school EYFS and childcare-register/funded-place assessment routes. Reviewed curriculum-exception and 2026–27 assessment routes require actual phase/direction evidence. Detailed temporary-exception conditions, provider-specific register/funding terms, childminder frameworks and specialist provision still need review.",
  activities:
    "Reviewed food core, transport/boarding classification, adventure, private-fostering and venue-permission routes. Actual licences, vehicle/driver categories and local conditions need evidence; detailed residential, taxi/international, specialist activity and licensing exemptions remain incomplete.",
  ace_icce:
    "Reviewed public ICCE participant requirements. Current institutional ACE-only agreements, entity-specific status and regional provider terms must be obtained and reviewed; portal evidence never grants external approval.",
};
export const englandDetailCoverage: TrackerCatalogue["coverage"] =
  englandCoverage.map((cell) => ({
    ...cell,
    reason: gaps[cell.topic],
    sourceIds: [
      ...new Set(
        englandDetailRequirements
          .filter((requirement) => requirement.topic === cell.topic)
          .flatMap((requirement) => requirement.sourceIds),
      ),
    ],
    review: englandReview,
  }));
