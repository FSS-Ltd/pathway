import {
  prisma,
  runReadOnlyTransaction,
  withTenantRlsContext,
} from "@pathway/db";
import { listStudentActiveSites } from "../student-active-sites";

jest.mock("@pathway/db", () => ({
  prisma: { tenant: { findMany: jest.fn() } },
  runReadOnlyTransaction: jest.fn(),
  withTenantRlsContext: jest.fn(),
}));

describe("student active-site discovery", () => {
  beforeEach(() => jest.clearAllMocks());

  it("discovers candidate identities with user RLS, then checks links inside each tenant", async () => {
    const discovery = {
      $executeRaw: jest.fn(),
      $executeRawUnsafe: jest.fn(),
      studentIdentity: {
        findMany: jest.fn().mockResolvedValue([{ tenantId: "site-a" }]),
      },
    };
    const scoped = {
      studentPortalPolicy: {
        findUnique: jest.fn().mockResolvedValue({ studentPortalEnabled: true }),
      },
      studentIdentityLink: {
        findMany: jest.fn().mockResolvedValue([{ id: "link-a" }]),
      },
    };
    jest
      .mocked(runReadOnlyTransaction)
      .mockImplementation(async (operation) => operation(discovery as never));
    jest
      .mocked(withTenantRlsContext)
      .mockImplementation(async (_site, _org, operation) =>
        operation(scoped as never),
      );
    jest.mocked(prisma.tenant.findMany).mockResolvedValue([
      {
        id: "site-a",
        name: "School",
        orgId: "org-a",
        timezone: "Europe/London",
        org: { name: "Organisation", slug: "org" },
      },
    ] as never);

    await expect(listStudentActiveSites("student-a")).resolves.toEqual([
      expect.objectContaining({ id: "site-a" }),
    ]);
    expect(discovery.$executeRaw).toHaveBeenCalled();
    expect(discovery.$executeRawUnsafe).toHaveBeenCalledWith(
      "SET LOCAL row_security = on",
    );
    expect(discovery.studentIdentity.findMany).toHaveBeenCalledWith({
      where: { userId: "student-a", user: { isActive: true } },
      select: { tenantId: true },
      take: 101,
    });
    expect(withTenantRlsContext).toHaveBeenCalledWith(
      "site-a",
      "org-a",
      expect.any(Function),
    );
    expect(scoped.studentIdentityLink.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        tenantId: "site-a",
        endedAt: null,
        revokedAt: null,
        studentIdentity: { tenantId: "site-a", userId: "student-a" },
      }),
      select: { id: true },
      take: 2,
    });

    scoped.studentPortalPolicy.findUnique.mockResolvedValue({
      studentPortalEnabled: false,
    });
    await expect(listStudentActiveSites("student-a")).resolves.toEqual([]);
  });
});
