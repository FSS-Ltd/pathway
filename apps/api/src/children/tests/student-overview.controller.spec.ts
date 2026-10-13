import { ForbiddenException } from "@nestjs/common";
import type { PathwayRequestContext } from "@pathway/auth";
import {
  ParentStudentOverviewController,
  StaffStudentOverviewController,
} from "../student-overview.controller";
import type { StudentOverviewService } from "../student-overview.service";

describe("student overview route authorization", () => {
  const staff = jest.fn();
  const parent = jest.fn();
  const service = { staff, parent } as unknown as StudentOverviewService;

  beforeEach(() => jest.clearAllMocks());

  it("does not admit a guardian to the staff overview route", () => {
    const context = {
      requireContext: () => ({
        siteRole: "VIEWER",
        roles: { tenant: [], org: [] },
        tenant: { tenantId: "site-a" },
        org: { orgId: "org-a" },
        user: { userId: "guardian-a" },
      }),
    } as unknown as PathwayRequestContext;
    const controller = new StaffStudentOverviewController(service, context);
    expect(() => controller.read("child-a")).toThrow(ForbiddenException);
    expect(staff).not.toHaveBeenCalled();
  });

  it("binds staff overview to the authenticated active site", () => {
    const context = {
      requireContext: () => ({
        siteRole: "STAFF",
        roles: { tenant: [], org: [] },
        tenant: { tenantId: "site-a" },
        org: { orgId: "org-a" },
        user: { userId: "staff-a" },
      }),
    } as unknown as PathwayRequestContext;
    const controller = new StaffStudentOverviewController(service, context);
    controller.read("child-a");
    expect(staff).toHaveBeenCalledWith("child-a", {
      siteId: "site-a",
      orgId: "org-a",
      userId: "staff-a",
      isSiteAdmin: false,
    });
  });

  it("passes the requested family site with the authenticated guardian identity", () => {
    const context = {
      requireContext: () => ({ user: { userId: "guardian-a" } }),
    } as unknown as PathwayRequestContext;
    const controller = new ParentStudentOverviewController(service, context);
    controller.read("site-a", "child-a");
    expect(parent).toHaveBeenCalledWith("site-a", "child-a", "guardian-a");
  });
});
