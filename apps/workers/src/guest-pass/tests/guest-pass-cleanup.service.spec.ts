import {
  GuestPassCleanupService,
  type GuestPassCleanupPrismaClient,
} from "../guest-pass-cleanup.service";

const prismaMock: Record<string, Record<string, jest.Mock>> = {
  tenant: { findMany: jest.fn() },
  child: { deleteMany: jest.fn() },
};

const withTenantRlsContextMock = jest
  .fn()
  .mockImplementation(
    async (
      tenantId: string,
      orgId: string,
      callback: (tx: GuestPassCleanupPrismaClient) => Promise<unknown> | unknown,
    ) => callback(prismaMock as unknown as GuestPassCleanupPrismaClient),
  );

jest.mock("@pathway/db", () => {
  const actual = jest.requireActual("@pathway/db");
  return {
    ...actual,
    get prisma() {
      return prismaMock;
    },
    withTenantRlsContext: (...args: unknown[]) =>
      withTenantRlsContextMock(...args),
  };
});

describe("GuestPassCleanupService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.GUEST_CLEANUP_ENABLED = "true";
    prismaMock.tenant.findMany.mockReset();
    prismaMock.child.deleteMany.mockReset();
  });

  it("skips when GUEST_CLEANUP_ENABLED is not true", async () => {
    process.env.GUEST_CLEANUP_ENABLED = "false";
    const svc = new GuestPassCleanupService(
      prismaMock as unknown as GuestPassCleanupPrismaClient,
    );
    await svc.run(new Date("2025-01-31T00:00:00Z"));
    expect(prismaMock.tenant.findMany).not.toHaveBeenCalled();
  });

  it("hard-deletes expired guest children per tenant", async () => {
    prismaMock.tenant.findMany.mockResolvedValue([
      { id: "t1", orgId: "o1" },
      { id: "t2", orgId: "o2" },
    ]);
    prismaMock.child.deleteMany.mockResolvedValue({ count: 2 });

    const svc = new GuestPassCleanupService(
      prismaMock as unknown as GuestPassCleanupPrismaClient,
    );
    const now = new Date("2025-02-01T00:00:00Z");
    await svc.run(now);

    expect(prismaMock.tenant.findMany).toHaveBeenCalledTimes(1);
    expect(withTenantRlsContextMock).toHaveBeenCalledWith(
      "t1",
      "o1",
      expect.any(Function),
    );
    expect(withTenantRlsContextMock).toHaveBeenCalledWith(
      "t2",
      "o2",
      expect.any(Function),
    );
    expect(prismaMock.child.deleteMany).toHaveBeenCalledWith({
      where: { isGuest: true, guestExpiresAt: { lt: now } },
    });
  });
});
