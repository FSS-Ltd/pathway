import { ConflictException } from "@nestjs/common";
import { FamilyIdentityImportService } from "../family-identity-import.service";
import { FamilyInvitesService } from "../family-invites.service";
import { StudentInvitesService } from "../student-invites.service";

const guardian = {
  target: "GUARDIAN" as const,
  childId: "child-a",
  email: "parent@example.test",
  reviewBasis: "SCHOOL_RECORDS" as const,
  confirmedLegalAccess: true as const,
};
const student = {
  target: "STUDENT" as const,
  childId: "child-b",
  email: "student@example.test",
  confirmedSchoolApproval: true as const,
};

it("continues after a row failure and reports only safe per-row outcomes", async () => {
  const guardians = {
    createForImport: jest.fn().mockResolvedValue("invited"),
  };
  const students = {
    createForImport: jest
      .fn()
      .mockRejectedValue(new ConflictException("Policy review required")),
  };
  const service = new FamilyIdentityImportService(
    guardians as unknown as FamilyInvitesService,
    students as unknown as StudentInvitesService,
  );
  const results = await service.importRows("site-a", "org-a", "admin-a", [
    guardian,
    student,
    guardian,
  ]);
  expect(results).toEqual([
    {
      rowNumber: 1,
      status: "invited",
      message: "Invitation sent. Access begins after verified acceptance.",
    },
    { rowNumber: 2, status: "failed", message: "Policy review required" },
    {
      rowNumber: 3,
      status: "invited",
      message: "Invitation sent. Access begins after verified acceptance.",
    },
  ]);
  expect(guardians.createForImport).toHaveBeenCalledTimes(2);
  expect(guardians.createForImport).toHaveBeenCalledWith(
    "site-a",
    "org-a",
    "admin-a",
    "child-a",
    "parent@example.test",
    "SCHOOL_RECORDS",
    true,
  );
  expect(students.createForImport).toHaveBeenCalledWith(
    "site-a",
    "org-a",
    "admin-a",
    "child-b",
    "student@example.test",
    true,
  );
});
