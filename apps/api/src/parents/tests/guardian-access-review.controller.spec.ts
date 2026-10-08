import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { assertOrgAdminAccess } from "../../orgs/org-admin-access";
import { GuardianAccessReviewController } from "../guardian-access-review.controller";
import { GuardianAccessReviewService } from "../guardian-access-review.service";

jest.mock("../../orgs/org-admin-access", () => ({
  assertOrgAdminAccess: jest.fn(),
}));

const approve = jest.fn();
const list = jest.fn();
const service = { approve, list } as unknown as GuardianAccessReviewService;
const controller = new GuardianAccessReviewController(service);
const request = { authUserId: "reviewer-a" } as Parameters<
  GuardianAccessReviewController["approve"]
>[3];

describe("GuardianAccessReviewController", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(assertOrgAdminAccess).mockResolvedValue("reviewer-a");
  });

  it("requires an explicit legal-access confirmation", async () => {
    await expect(
      controller.approve(
        "parent-a",
        "child-a",
        { reviewBasis: "SCHOOL_RECORDS", confirmedLegalAccess: false },
        request,
        "site-a",
        "org-a",
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(approve).not.toHaveBeenCalled();
  });

  it("denies a reviewer without organisation admin access", async () => {
    jest
      .mocked(assertOrgAdminAccess)
      .mockRejectedValueOnce(new ForbiddenException());
    await expect(
      controller.approve(
        "parent-a",
        "child-a",
        { reviewBasis: "LEGAL_DOCUMENT", confirmedLegalAccess: true },
        request,
        "site-a",
        "org-a",
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(approve).not.toHaveBeenCalled();
  });

  it("passes the site, actor, and reviewed link to the service", async () => {
    approve.mockResolvedValueOnce({ id: "relationship-a", childId: "child-a" });
    await controller.approve(
      "parent-a",
      "child-a",
      { reviewBasis: "SCHOOL_RECORDS", confirmedLegalAccess: true },
      request,
      "site-a",
      "org-a",
    );
    expect(approve).toHaveBeenCalledWith(
      "site-a",
      "org-a",
      "reviewer-a",
      "parent-a",
      "child-a",
      "SCHOOL_RECORDS",
    );
  });
});
