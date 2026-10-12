const findMany = jest.fn();
const findFirst = jest.fn();

jest.mock("@pathway/db", () => ({
  prisma: {
    user: { findMany, findFirst },
    $disconnect: jest.fn(),
  },
}));

import { ParentsService } from "../parents.service";

describe("ParentsService", () => {
  let service: ParentsService;
  const tenantId = "tenant-1";
  const orgId = "org-1";

  beforeEach(() => {
    jest.clearAllMocks();
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
});
