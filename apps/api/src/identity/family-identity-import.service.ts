import { HttpException, Inject, Injectable } from "@nestjs/common";
import { FamilyInvitesService } from "./family-invites.service";
import { StudentInvitesService } from "./student-invites.service";

export type FamilyIdentityImportRow =
  | {
      target: "GUARDIAN";
      childId: string;
      email: string;
      reviewBasis: "SCHOOL_RECORDS" | "LEGAL_DOCUMENT";
      confirmedLegalAccess: true;
    }
  | {
      target: "STUDENT";
      childId: string;
      email: string;
      confirmedSchoolApproval: true;
    };

export type FamilyIdentityImportResult = {
  rowNumber: number;
  status: "invited" | "existing" | "failed";
  message: string;
};

@Injectable()
export class FamilyIdentityImportService {
  constructor(
    @Inject(FamilyInvitesService)
    private readonly guardians: FamilyInvitesService,
    @Inject(StudentInvitesService)
    private readonly students: StudentInvitesService,
  ) {}

  async importRows(
    tenantId: string,
    orgId: string,
    actorUserId: string,
    rows: FamilyIdentityImportRow[],
  ): Promise<FamilyIdentityImportResult[]> {
    const results: FamilyIdentityImportResult[] = [];
    for (const [index, row] of rows.entries()) {
      try {
        const status =
          row.target === "GUARDIAN"
            ? await this.guardians.createForImport(
                tenantId,
                orgId,
                actorUserId,
                row.childId,
                row.email,
                row.reviewBasis,
                row.confirmedLegalAccess,
              )
            : await this.students.createForImport(
                tenantId,
                orgId,
                actorUserId,
                row.childId,
                row.email,
                row.confirmedSchoolApproval,
              );
        results.push({
          rowNumber: index + 1,
          status,
          message:
            status === "invited"
              ? "Invitation sent. Access begins after verified acceptance."
              : "An invitation already exists. Review the child profile before resending.",
        });
      } catch (cause) {
        results.push({
          rowNumber: index + 1,
          status: "failed",
          message:
            cause instanceof HttpException
              ? cause.message
              : "Unable to process this row. Retry or review the child profile.",
        });
      }
    }
    return results;
  }
}
