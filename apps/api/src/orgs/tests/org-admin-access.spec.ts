import { UnauthorizedException } from "@nestjs/common";

jest.mock("@pathway/db", () => ({
  OrgRole: { ORG_ADMIN: "ORG_ADMIN", ORG_MEMBER: "ORG_MEMBER" },
  prisma: {
    orgMembership: { findFirst: jest.fn() },
    userOrgRole: { findFirst: jest.fn() },
    user: { findUnique: jest.fn() },
  },
}));

import { prisma } from "@pathway/db";
import { assertOrgAdminAccess } from "../org-admin-access";

const membership = prisma.orgMembership.findFirst as jest.Mock;
const legacyRole = prisma.userOrgRole.findFirst as jest.Mock;
const user = prisma.user.findUnique as jest.Mock;

describe("org admin access", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    membership.mockResolvedValue(null);
    legacyRole.mockResolvedValue(null);
    user.mockResolvedValue(null);
  });

  it("allows an ordinary organisation admin without looking up superuser status", async () => {
    membership.mockResolvedValue({ role: "ORG_ADMIN" });
    await expect(
      assertOrgAdminAccess("admin", "org-1", "view people"),
    ).resolves.toBe("admin");
    expect(user).not.toHaveBeenCalled();
  });

  it("allows an active member superuser to read People but not perform admin mutations", async () => {
    membership.mockResolvedValue({ role: "ORG_MEMBER" });
    user.mockResolvedValue({ superUser: true, isActive: true });

    await expect(
      assertOrgAdminAccess("super", "org-1", "view people", "operational-read"),
    ).resolves.toBe("super");
    await expect(
      assertOrgAdminAccess("super", "org-1", "change settings"),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rejects a superuser without organisation membership", async () => {
    user.mockResolvedValue({ superUser: true, isActive: true });
    await expect(
      assertOrgAdminAccess(
        "super",
        "other-org",
        "view people",
        "operational-read",
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(user).not.toHaveBeenCalled();
  });

  it("rejects an inactive superuser", async () => {
    membership.mockResolvedValue({ role: "ORG_MEMBER" });
    user.mockResolvedValue({ superUser: true, isActive: false });
    await expect(
      assertOrgAdminAccess("super", "org-1", "view people", "operational-read"),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
