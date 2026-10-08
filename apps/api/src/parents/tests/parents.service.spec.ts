const findMany = jest.fn();
const findFirst = jest.fn();
const update = jest.fn();
const findChildren = jest.fn();

jest.mock("@pathway/db", () => ({
  withTenantRlsContext: jest.fn(),
  prisma: {
    user: { findMany, findFirst, update },
    child: { findMany: findChildren },
    $disconnect: jest.fn(),
  },
}));

import { ConflictException } from "@nestjs/common";
import { withTenantRlsContext } from "@pathway/db";
import { ParentsService } from "../parents.service";

describe("ParentsService", () => {
  let service: ParentsService;
  const tenantId = "tenant-1";
  const orgId = "org-1";

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(withTenantRlsContext).mockResolvedValue(null);
    service = new ParentsService();
  });

  describe("findAllForTenant", () => {
    it("returns parents scoped to tenant and family access", async () => {
      findMany.mockResolvedValueOnce([
        {
          id: "p1",
          email: "parent1@test.local",
          name: "Parent One",
          hasFamilyAccess: true,
          children: [{ id: "c1" }, { id: "c2" }],
        },
      ]);

      const result = await service.findAllForTenant(tenantId, orgId);

      expect(result).toEqual([
        {
          id: "p1",
          fullName: "Parent One",
          email: "parent1@test.local",
          childrenCount: 2,
        },
      ]);
      expect(findMany).toHaveBeenCalledWith({
        where: {
          hasFamilyAccess: true,
          OR: [{ tenantId }, { children: { some: { tenantId } } }],
        },
        select: expect.any(Object),
        orderBy: [{ name: "asc" }, { email: "asc" }],
      });
    });
  });

  describe("findOneForTenant", () => {
    it("returns detail when tenant matches", async () => {
      findFirst.mockResolvedValueOnce({
        id: "p1",
        email: "parent1@test.local",
        name: "Parent One",
        hasFamilyAccess: true,
        children: [
          { id: "c1", firstName: "Jess", lastName: "Doe" },
          { id: "c2", firstName: "Sam", lastName: "Smith" },
        ],
      });

      const result = await service.findOneForTenant(tenantId, orgId, "p1");

      expect(result).toEqual({
        id: "p1",
        fullName: "Parent One",
        email: "parent1@test.local",
        children: [
          { id: "c1", fullName: "Jess Doe" },
          { id: "c2", fullName: "Sam Smith" },
        ],
      });
      expect(findFirst).toHaveBeenCalledWith({
        where: {
          id: "p1",
          hasFamilyAccess: true,
          OR: [{ tenantId }, { children: { some: { tenantId } } }],
        },
        select: expect.any(Object),
      });
    });

    it("returns null when parent not found in tenant", async () => {
      findFirst.mockResolvedValueOnce(null);

      const result = await service.findOneForTenant(tenantId, orgId, "missing");

      expect(result).toBeNull();
    });
  });

  it("updates only the selected site's child links", async () => {
    findFirst
      .mockResolvedValueOnce({ id: "p1", children: [{ id: "old-site-child" }] })
      .mockResolvedValueOnce({
        id: "p1",
        name: "Parent One",
        email: null,
        children: [
          { id: "new-site-child", firstName: "Sam", lastName: "Child" },
        ],
      });
    findChildren.mockResolvedValueOnce([{ id: "new-site-child" }]);
    update.mockResolvedValueOnce({ id: "p1" });

    await service.updateForTenant(tenantId, orgId, "p1", {
      childIds: ["new-site-child"],
    });

    expect(findFirst).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        select: {
          id: true,
          children: { where: { tenantId }, select: { id: true } },
        },
      }),
    );
    expect(update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: {
        children: {
          disconnect: [{ id: "old-site-child" }],
          connect: [{ id: "new-site-child" }],
        },
      },
    });
    expect(withTenantRlsContext).toHaveBeenCalledWith(
      tenantId,
      orgId,
      expect.any(Function),
    );
  });

  it("blocks unlinking a child with current full guardian access", async () => {
    findFirst.mockResolvedValueOnce({
      id: "p1",
      children: [{ id: "approved-child" }],
    });
    jest.mocked(withTenantRlsContext).mockResolvedValueOnce({
      id: "relationship-a",
    });

    await expect(
      service.updateForTenant(tenantId, orgId, "p1", { childIds: [] }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(update).not.toHaveBeenCalled();
  });
});
