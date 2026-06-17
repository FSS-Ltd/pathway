import { Test, TestingModule } from "@nestjs/testing";
import { OrgsService } from "../orgs.service";
import { BillingService } from "../../billing/billing.service";
import { LoggingService } from "../../common/logging/logging.service";

// ---- Local helper types to avoid `any` -------------------------------------
// Minimal shapes used in this spec; they mirror just what we need.
type OrgRecord = {
  id: string;
  name: string;
  slug: string;
  planCode?: string;
  isSuite?: boolean;
  parentPortalEnabled?: boolean;
};

type RegisterOrgInput = {
  org: { name: string; slug: string };
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
    findMany: (args: unknown) => Promise<OrgRecord[]>;
    update: (args: unknown) => Promise<OrgRecord>;
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
    findMany: jest.fn(),
    update: jest.fn(),
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

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrgsService,
        { provide: BillingService, useValue: mockBilling },
        LoggingService,
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
        org: { name: baseOrg.name, slug: baseOrg.slug },
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
        },
      ]);

      const result = await service.list("org_1");

      expect(result).toEqual([
        expect.objectContaining({
          id: "org_1",
          parentPortalEnabled: false,
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
});
