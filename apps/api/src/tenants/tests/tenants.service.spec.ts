import { BadRequestException, NotFoundException } from "@nestjs/common";
import { TenantsService } from "../tenants.service";

// Mock the shared Prisma client module-first, then access its fns via import
jest.mock("@pathway/db", () => ({
  prisma: {
    tenant: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
    },
    org: {
      findUnique: jest.fn(),
    },
    publicSignupLink: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    orgEntitlementSnapshot: {
      findFirst: jest.fn(),
    },
    subscription: {
      findFirst: jest.fn(),
    },
  },
}));

// Now import the mocked prisma to get references to the mock functions
import { prisma } from "@pathway/db";
const findMany = prisma.tenant.findMany as unknown as jest.Mock;
const findUnique = prisma.tenant.findUnique as unknown as jest.Mock;
const create = prisma.tenant.create as unknown as jest.Mock;
const count = prisma.tenant.count as unknown as jest.Mock;
const orgFindUnique = prisma.org.findUnique as unknown as jest.Mock;
const linkFindFirst = prisma.publicSignupLink.findFirst as unknown as jest.Mock;
const linkUpdateMany = prisma.publicSignupLink.updateMany as unknown as jest.Mock;
const linkUpdate = prisma.publicSignupLink.update as unknown as jest.Mock;
const linkCreate = prisma.publicSignupLink.create as unknown as jest.Mock;
const snapshotFindFirst = prisma.orgEntitlementSnapshot.findFirst as unknown as jest.Mock;
const subscriptionFindFirst = prisma.subscription.findFirst as unknown as jest.Mock;

describe("TenantsService", () => {
  let svc: TenantsService;

  const tenant = {
    id: "t1",
    name: "Demo Church",
    slug: "demo-church",
    createdAt: new Date(),
  };

  const ORG_ID = "11111111-1111-1111-1111-111111111111";

  beforeEach(() => {
    jest.clearAllMocks();
    svc = new TenantsService();
    orgFindUnique.mockResolvedValue({ id: ORG_ID });
    count.mockResolvedValue(0);
    snapshotFindFirst.mockResolvedValue(null);
    subscriptionFindFirst.mockResolvedValue({ planCode: "STARTER_MONTHLY" });
  });

  describe("list", () => {
    it("returns tenants", async () => {
      findMany.mockResolvedValue([tenant]);
      await expect(svc.list()).resolves.toEqual([tenant]);
      expect(findMany).toHaveBeenCalledWith({
        select: {
          id: true,
          name: true,
          slug: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: "desc" },
      });
    });
  });

  describe("getBySlug", () => {
    it("returns a tenant when found", async () => {
      findUnique.mockResolvedValue(tenant);
      await expect(svc.getBySlug("demo-church")).resolves.toEqual(tenant);
      expect(findUnique).toHaveBeenCalledWith({
        where: { slug: "demo-church" },
        select: {
          id: true,
          name: true,
          slug: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    });

    it("throws NotFound when missing", async () => {
      findUnique.mockResolvedValue(null);
      await expect(svc.getBySlug("missing")).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe("create", () => {
    it("lowercases slug and creates tenant", async () => {
      findUnique.mockResolvedValue(null); // pre-check: no duplicate
      create.mockResolvedValue({ ...tenant, slug: "new-church" });

      const result = await svc.create({
        name: "New Church",
        slug: "New-Church",
        orgId: ORG_ID,
      });
      expect(findUnique).toHaveBeenCalledWith({
        where: { slug: "new-church" },
      });
      expect(create).toHaveBeenCalledWith({
        data: {
          name: "New Church",
          slug: "new-church",
          org: { connect: { id: ORG_ID } },
        },
        select: {
          id: true,
          name: true,
          slug: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      expect(orgFindUnique).toHaveBeenCalledWith({
        where: { id: ORG_ID },
        select: { id: true },
      });
      expect(result.slug).toBe("new-church");
    });

    it("creates tenant and connects optional relations when provided", async () => {
      findUnique.mockResolvedValue(null); // pre-check: no duplicate
      create.mockResolvedValue({ ...tenant, slug: "demo-with-links" });

      const dto = {
        orgId: ORG_ID,
        name: "Demo With Links",
        slug: "demo-with-links",
        users: [
          "11111111-1111-1111-1111-111111111111",
          "22222222-2222-2222-2222-222222222222",
        ],
        groups: ["33333333-3333-3333-3333-333333333333"],
        children: [
          "44444444-4444-4444-4444-444444444444",
          "55555555-5555-5555-5555-555555555555",
          "66666666-6666-6666-6666-666666666666",
        ],
        roles: ["77777777-7777-7777-7777-777777777777"],
      };

      const result = await svc.create(dto);

      expect(create).toHaveBeenCalledWith({
        data: {
          org: { connect: { id: ORG_ID } },
          name: "Demo With Links",
          slug: "demo-with-links",
          users: {
            connect: [
              { id: "11111111-1111-1111-1111-111111111111" },
              { id: "22222222-2222-2222-2222-222222222222" },
            ],
          },
          groups: {
            connect: [{ id: "33333333-3333-3333-3333-333333333333" }],
          },
          children: {
            connect: [
              { id: "44444444-4444-4444-4444-444444444444" },
              { id: "55555555-5555-5555-5555-555555555555" },
              { id: "66666666-6666-6666-6666-666666666666" },
            ],
          },
          roles: {
            connect: [{ id: "77777777-7777-7777-7777-777777777777" }],
          },
        },
        select: {
          id: true,
          name: true,
          slug: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      expect(orgFindUnique).toHaveBeenCalledWith({
        where: { id: ORG_ID },
        select: { id: true },
      });
      expect(result.slug).toBe("demo-with-links");
    });

    it("throws BadRequest when slug already exists (pre-check)", async () => {
      findUnique.mockResolvedValue(tenant); // duplicate
      await expect(
        svc.create({ name: "Dup", slug: "demo-church", orgId: ORG_ID }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(create).not.toHaveBeenCalled();
    });

    it("throws BadRequest when unique constraint race occurs (P2002)", async () => {
      findUnique.mockResolvedValue(null);
      const p2002 = Object.assign(new Error("Unique constraint"), {
        code: "P2002",
      });
      create.mockRejectedValue(p2002);

      await expect(
        svc.create({ name: "Race", slug: "race-church", orgId: ORG_ID }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("blocks create when site cap is reached", async () => {
      findUnique.mockResolvedValue(null);
      snapshotFindFirst.mockResolvedValue({ maxSites: 1 });
      count.mockResolvedValue(1);

      await expect(
        svc.create({ name: "Second Site", slug: "second-site", orgId: ORG_ID }),
      ).rejects.toThrow(/sites cap reached/i);
      expect(create).not.toHaveBeenCalled();
    });
  });

  describe("getOrCreatePublicSignupLink", () => {
    const TENANT_ID = "tenant-signup-1";

    it("returns existing active link for tenant when tokenForDisplay is set", async () => {
      linkFindFirst.mockResolvedValue({
        id: "link-1",
        tokenForDisplay: "existing-token-abc",
        expiresAt: null,
      });
      const result = await svc.getOrCreatePublicSignupLink(
        TENANT_ID,
        ORG_ID,
        "user-1",
      );
      expect(linkFindFirst).toHaveBeenCalledWith({
        where: {
          tenantId: TENANT_ID,
          revokedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
        },
        select: { id: true, tokenForDisplay: true, expiresAt: true },
      });
      expect(result.tenantId).toBe(TENANT_ID);
      expect(result.signupUrl).toContain("existing-token-abc");
      expect(result.isStable).toBe(true);
      expect(result.tokenExpiresAt).toBeNull();
      expect(linkCreate).not.toHaveBeenCalled();
    });

    it("creates new link if none exists", async () => {
      linkFindFirst.mockResolvedValue(null);
      linkCreate.mockResolvedValue({});
      const result = await svc.getOrCreatePublicSignupLink(
        TENANT_ID,
        ORG_ID,
        null,
      );
      expect(linkFindFirst).toHaveBeenCalled();
      expect(linkCreate).toHaveBeenCalledWith({
        data: {
          orgId: ORG_ID,
          tenantId: TENANT_ID,
          tokenHash: expect.any(String),
          tokenForDisplay: expect.any(String),
          expiresAt: null,
          createdByUserId: null,
        },
      });
      expect(result.tenantId).toBe(TENANT_ID);
      expect(result.signupUrl).toMatch(/\?token=/);
      expect(result.isStable).toBe(true);
    });

    it("does not return revoked/expired link; creates new after revoking legacy", async () => {
      linkFindFirst.mockResolvedValue({
        id: "legacy-link",
        tokenForDisplay: null,
        expiresAt: null,
      });
      linkUpdate.mockResolvedValue({});
      linkCreate.mockResolvedValue({});
      const result = await svc.getOrCreatePublicSignupLink(
        TENANT_ID,
        ORG_ID,
        "user-1",
      );
      expect(linkUpdate).toHaveBeenCalledWith({
        where: { id: "legacy-link" },
        data: { revokedAt: expect.any(Date) },
      });
      expect(linkCreate).toHaveBeenCalled();
      expect(result.tenantId).toBe(TENANT_ID);
      expect(result.signupUrl).toMatch(/\?token=/);
    });
  });

  describe("rotatePublicSignupLink", () => {
    const TENANT_ID = "tenant-rotate-1";

    it("revokes existing links and creates new one", async () => {
      linkUpdateMany.mockResolvedValue({ count: 1 });
      linkFindFirst.mockResolvedValue(null);
      linkCreate.mockResolvedValue({});
      const result = await svc.rotatePublicSignupLink(
        TENANT_ID,
        ORG_ID,
        "user-1",
      );
      expect(linkUpdateMany).toHaveBeenCalledWith({
        where: { tenantId: TENANT_ID, revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(linkCreate).toHaveBeenCalled();
      expect(result.tenantId).toBe(TENANT_ID);
      expect(result.signupUrl).toMatch(/\?token=/);
    });
  });
});
