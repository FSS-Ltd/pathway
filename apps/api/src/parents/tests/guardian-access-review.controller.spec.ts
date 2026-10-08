import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { assertOrgAdminAccess } from "../../orgs/org-admin-access";
import { GuardianAccessReviewController } from "../guardian-access-review.controller";
import { GuardianAccessReviewService } from "../guardian-access-review.service";

jest.mock("../../orgs/org-admin-access", () => ({
  assertOrgAdminAccess: jest.fn(),
}));

const approve = jest.fn();
const list = jest.fn();
const revoke = jest.fn();
const service = {
  approve,
  list,
  revoke,
} as unknown as GuardianAccessReviewService;
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

  it("requires a meaningful revocation reason", async () => {
    await expect(
      controller.revoke(
        "parent-a",
        "child-a",
        { reason: "short" },
        request,
        "site-a",
        "org-a",
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(revoke).not.toHaveBeenCalled();
  });

  it("requires organisation admin access to revoke", async () => {
    jest
      .mocked(assertOrgAdminAccess)
      .mockRejectedValueOnce(new ForbiddenException());
    await expect(
      controller.revoke(
        "parent-a",
        "child-a",
        { reason: "Court order reviewed" },
        request,
        "site-a",
        "org-a",
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(revoke).not.toHaveBeenCalled();
  });

  it("passes the scoped revocation to the service", async () => {
    revoke.mockResolvedValueOnce({ id: "relationship-a" });
    await controller.revoke(
      "parent-a",
      "child-a",
      { reason: "  Court order reviewed  " },
      request,
      "site-a",
      "org-a",
    );
    expect(revoke).toHaveBeenCalledWith(
      "site-a",
      "org-a",
      "reviewer-a",
      "parent-a",
      "child-a",
      "Court order reviewed",
    );
  });
});
