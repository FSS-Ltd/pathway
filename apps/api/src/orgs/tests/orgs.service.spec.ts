import { Test, TestingModule } from "@nestjs/testing";
import { OrgsService } from "../orgs.service";
import { BillingService } from "../../billing/billing.service";
import { LoggingService } from "../../common/logging/logging.service";
import { SupabaseStorageService } from "../../common/storage/supabase-storage.service";

// ---- Local helper types to avoid `any` -------------------------------------
// Minimal shapes used in this spec; they mirror just what we need.
type OrgRecord = {
  id: string;
  name: string;
  slug: string;
  planCode?: string;
  isSuite?: boolean;
  parentPortalEnabled?: boolean;
  logoStorageKey?: string | null;
};

type RegisterOrgInput = {
  org: { name: string; slug: string; sector: string };
  admin?: { email?: string; fullName?: string; userId?: string };
  initialTenant: {
    create: true;
    name: string;
    slug: string;
  };
};

// Subset of the Prisma client used within OrgsService
interface PrismaSubset {
  org: {
    create: (args: {
      data: { name: string; slug: string; planCode?: string };
    }) => Promise<OrgRecord>;
    findUnique: (args: {
      where: { slug?: string; id?: string };
    }) => Promise<OrgRecord | null>;
    findFirst: (args: unknown) => Promise<OrgRecord | null>;
    findMany: (args: unknown) => Promise<OrgRecord[]>;
    update: (args: unknown) => Promise<OrgRecord>;
  };
  orgVertical: {
    upsert: (args: unknown) => Promise<unknown>;
  };
  tenant: { create: (args: unknown) => Promise<unknown> };
  user: { create: (args: unknown) => Promise<unknown> };
  $transaction: <T>(cb: (tx: PrismaSubset) => Promise<T>) => Promise<T>;
}

// ---- Mock Prisma from @pathway/db -----------------------------------------
// We mock the exported `prisma` singleton that OrgsService relies on.
const prismaMock: PrismaSubset = {
  org: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  orgVertical: {
    upsert: jest.fn(),
  },
  tenant: {
    create: jest.fn(),
  },
  user: {
    create: jest.fn(),
  },
  $transaction: jest.fn(async <T>(cb: (tx: PrismaSubset) => Promise<T>) =>
    cb(prismaMock),
  ),
};

jest.mock("@pathway/db", () => ({
  get prisma() {
    return prismaMock as unknown as PrismaSubset;
  },
}));
// ---------------------------------------------------------------------------

describe("OrgsService", () => {
  let service: OrgsService;

  const mockBilling: Pick<BillingService, "checkout"> = {
    checkout: jest.fn(async (input) => ({
      // Echo back required inputs so the shape matches CheckoutResult
      provider: input.provider,
      planCode: input.planCode,
      mode: input.mode,
      seats: input.seats,
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl,

      // Typical results a real provider would return
      subscriptionId: "sub_test_123",
      customerId: input.customerId ?? "cus_test_123",
      clientSecret: "cs_test",
      status: "active",
    })),
  };

  const mockStorage: Pick<
    SupabaseStorageService,
    "isConfigured" | "uploadObject" | "getPublicUrl"
  > = {
    isConfigured: jest.fn(() => true),
    uploadObject: jest.fn(async (input) => ({
      bucket: input.bucket,
      key: input.key,
    })),
    getPublicUrl: jest.fn(
      (key: string) => `https://supabase.test/storage/v1/object/public/public-bucket/${key}`,
    ),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrgsService,
        { provide: BillingService, useValue: mockBilling },
        LoggingService,
        { provide: SupabaseStorageService, useValue: mockStorage },
      ],
    }).compile();

    service = module.get<OrgsService>(OrgsService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("register", () => {
    const baseOrg: OrgRecord = {
      id: "org_1",
      name: "Acme Church",
      slug: "acme-church",
    };

    it("creates an org without calling billing when billing is omitted", async () => {
      (prismaMock.org.create as jest.Mock).mockResolvedValue(baseOrg);

      const dto: RegisterOrgInput = {
        org: { name: baseOrg.name, slug: baseOrg.slug, sector: "CHURCH" },
        admin: { email: "admin@acme.test", fullName: "Admin User" },
        initialTenant: { create: true, name: "Kids", slug: "kids" },
      };

      const result = await service.register(dto);

      expect(prismaMock.org.create).toHaveBeenCalledTimes(1);
      expect(mockBilling.checkout).not.toHaveBeenCalled();
      expect(result).toEqual(
        expect.objectContaining({
          org: expect.objectContaining({ id: baseOrg.id }),
        }),
      );
      // also ensure billing was not returned when omitted
      expect((result as Record<string, unknown>).billing).toBeUndefined();
    });
  });

  describe("list", () => {
    it("returns the parent portal setting for the current org", async () => {
      (prismaMock.org.findMany as jest.Mock).mockResolvedValue([
        {
          id: "org_1",
          name: "Acme Church",
          slug: "acme-church",
          planCode: "STARTER",
          isSuite: false,
          parentPortalEnabled: false,
          orgVertical: { vertical: "CLUB" },
        },
      ]);

      const result = await service.list("org_1");

      expect(result).toEqual([
        expect.objectContaining({
          id: "org_1",
          parentPortalEnabled: false,
          vertical: "CLUB",
        }),
      ]);
      expect(prismaMock.org.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          select: expect.objectContaining({
            parentPortalEnabled: true,
          }),
        }),
      );
    });
  });

  describe("updateCurrentOrg", () => {
    it("updates the parent portal setting without requiring a name change", async () => {
      (prismaMock.org.findUnique as jest.Mock).mockResolvedValue({
        id: "org_1",
        name: "Acme Church",
        slug: "acme-church",
      });
      (prismaMock.org.update as jest.Mock).mockResolvedValue({
        id: "org_1",
        name: "Acme Church",
        slug: "acme-church",
        parentPortalEnabled: false,
      });

      const result = await service.updateCurrentOrg("org_1", {
        parentPortalEnabled: false,
      } as unknown as Parameters<OrgsService["updateCurrentOrg"]>[1]);

      expect(result).toEqual(
        expect.objectContaining({
          id: "org_1",
          parentPortalEnabled: false,
        }),
      );
      expect(prismaMock.org.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "org_1" },
          data: { parentPortalEnabled: false },
          select: expect.objectContaining({
            parentPortalEnabled: true,
          }),
        }),
      );
    });
  });

  describe("changeVertical", () => {
    it("upserts the organisation vertical", async () => {
      (prismaMock.org.findUnique as jest.Mock).mockResolvedValue({
        id: "org_1",
      });
      (prismaMock.orgVertical.upsert as jest.Mock).mockResolvedValue({
        orgId: "org_1",
        vertical: "CLUB",
      });

      await expect(
        service.changeVertical("org_1", "CLUB"),
      ).resolves.toEqual({
        orgId: "org_1",
        vertical: "CLUB",
      });
      expect(prismaMock.orgVertical.upsert).toHaveBeenCalledWith({
        where: { orgId: "org_1" },
        create: { orgId: "org_1", vertical: "CLUB" },
        update: { vertical: "CLUB" },
      });
    });

    it("rejects a missing organisation before writing", async () => {
      (prismaMock.org.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.changeVertical("missing-org", "CHURCH"),
      ).rejects.toThrow("Organisation not found");
      expect(prismaMock.orgVertical.upsert).not.toHaveBeenCalled();
    });
  });

  describe("list / getBySlug logoUrl", () => {
    it("maps a null logoStorageKey to a null logoUrl", async () => {
      (prismaMock.org.findMany as jest.Mock).mockResolvedValue([
        { id: "org_1", name: "Acme Church", slug: "acme-church", logoStorageKey: null },
      ]);

      const [org] = await service.list("org_1");

      expect(org.logoUrl).toBeNull();
      expect(mockStorage.getPublicUrl).not.toHaveBeenCalled();
    });

    it("builds a public URL when a logoStorageKey is set", async () => {
      (prismaMock.org.findMany as jest.Mock).mockResolvedValue([
        {
          id: "org_1",
          name: "Acme Church",
          slug: "acme-church",
          logoStorageKey: "orgs/org_1/logo.png",
        },
      ]);

      const [org] = await service.list("org_1");

      expect(mockStorage.getPublicUrl).toHaveBeenCalledWith("orgs/org_1/logo.png");
      expect(org.logoUrl).toBe(
        "https://supabase.test/storage/v1/object/public/public-bucket/orgs/org_1/logo.png",
      );
    });

    it("getBySlug surfaces logoUrl and throws when not found", async () => {
      (prismaMock.org.findFirst as jest.Mock).mockResolvedValue({
        id: "org_1",
        name: "Acme Church",
        slug: "acme-church",
        orgVertical: { vertical: "CHURCH" },
        logoStorageKey: "orgs/org_1/logo.png",
      });

      const org = await service.getBySlug("acme-church", "org_1");
      expect(org.logoUrl).toContain("orgs/org_1/logo.png");
      expect(org.vertical).toBe("CHURCH");

      (prismaMock.org.findFirst as jest.Mock).mockResolvedValue(null);
      await expect(service.getBySlug("missing", "org_1")).rejects.toThrow();
    });
  });

  describe("uploadLogo", () => {
    const validBase64 = Buffer.from("fake-logo-bytes").toString("base64");

    it("rejects empty logo data", async () => {
      await expect(
        service.uploadLogo("org_1", "", "image/png"),
      ).rejects.toThrow("Logo data is empty");
      expect(prismaMock.org.update).not.toHaveBeenCalled();
    });

    it("rejects disallowed content types", async () => {
      await expect(
        service.uploadLogo("org_1", validBase64, "application/pdf"),
      ).rejects.toThrow("Logo must be one of");
    });

    it("rejects uploads over the size cap", async () => {
      const big = Buffer.alloc(6 * 1024 * 1024).toString("base64");
      await expect(
        service.uploadLogo("org_1", big, "image/png"),
      ).rejects.toThrow("Logo must be at most");
    });

    it("throws when storage is not configured", async () => {
      (mockStorage.isConfigured as jest.Mock).mockReturnValueOnce(false);
      await expect(
        service.uploadLogo("org_1", validBase64, "image/png"),
      ).rejects.toThrow("storage is not configured");
      expect(prismaMock.org.update).not.toHaveBeenCalled();
    });

    it("uploads to the public bucket and persists the storage key", async () => {
      const result = await service.uploadLogo("org_1", validBase64, "image/png");

      expect(mockStorage.uploadObject).toHaveBeenCalledWith(
        expect.objectContaining({
          bucket: "public",
          key: "orgs/org_1/logo.png",
          contentType: "image/png",
        }),
      );
      expect(prismaMock.org.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "org_1" },
          data: { logoStorageKey: "orgs/org_1/logo.png", logoContentType: "image/png" },
        }),
      );
      expect(result.logoUrl).toContain("orgs/org_1/logo.png");
    });

    it("accepts a data: URL prefix and infers content type from it", async () => {
      const dataUrl = `data:image/webp;base64,${validBase64}`;
      await service.uploadLogo("org_1", dataUrl);

      expect(mockStorage.uploadObject).toHaveBeenCalledWith(
        expect.objectContaining({ key: "orgs/org_1/logo.webp", contentType: "image/webp" }),
      );
    });
  });

  describe("deleteLogo", () => {
    it("clears the logo fields and returns a null logoUrl", async () => {
      (prismaMock.org.update as jest.Mock).mockResolvedValue({
        id: "org_1",
        name: "Acme Church",
        slug: "acme-church",
        logoStorageKey: null,
      });

      const result = await service.deleteLogo("org_1");

      expect(prismaMock.org.update).toHaveBeenCalledWith({
        where: { id: "org_1" },
        data: { logoStorageKey: null, logoContentType: null },
      });
      expect(result).toEqual({ logoUrl: null });
    });
  });
});
