/* eslint-disable @typescript-eslint/no-explicit-any */
// Local shim to avoid importing @pathway/db (which pulls in @prisma/client at runtime)
enum SwapStatus {
  REQUESTED = "REQUESTED",
  ACCEPTED = "ACCEPTED",
  REJECTED = "REJECTED",
  CANCELLED = "CANCELLED",
}
import type { SwapsService } from "../../swaps/swaps.service";

// Simplified prisma mock types (loose to ease tenant filters)
type PrismaSwapDelegate = {
  create: jest.Mock<Promise<any>, [any?]>;
  findFirst: jest.Mock<Promise<any>, [any?]>;
  findMany: jest.Mock<Promise<any[]>, [any?]>;
  update: jest.Mock<Promise<any>, [any?]>;
  deleteMany: jest.Mock<Promise<any>, [any?]>;
};

type PrismaAssignmentDelegate = {
  findFirst: jest.Mock<Promise<any>, [any?]>;
  update: jest.Mock<Promise<any>, [any?]>;
};

type PrismaUserDelegate = {
  findFirst: jest.Mock<Promise<any>, [any?]>;
};

type PrismaMock = {
  swapRequest: PrismaSwapDelegate;
  assignment: PrismaAssignmentDelegate;
  user: PrismaUserDelegate;
};

describe("SwapsService", () => {
  const base = {
    id: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
    assignmentId: "11111111-1111-1111-1111-111111111111",
    fromUserId: "22222222-2222-2222-2222-222222222222",
    toUserId: null,
    status: SwapStatus.REQUESTED,
    createdAt: new Date("2025-01-01T12:00:00Z"),
    updatedAt: new Date("2025-01-01T12:00:00Z"),
  };
  const tenantId = "t1";

  let prisma: PrismaMock;
  let SwapsServiceClass: new () => SwapsService;
  let service: SwapsService;

  beforeEach(async () => {
    jest.resetModules();

    const prismaMock: PrismaMock = {
      swapRequest: {
        create: jest.fn(async ({ data }) => ({ ...base, ...data })),
        findFirst: jest.fn(async ({ where }) => ({ ...base, ...where })),
        findMany: jest.fn(async () => [base]),
        update: jest.fn(async ({ where, data }) => ({
          ...base,
          ...where,
          ...data,
        })),
        deleteMany: jest.fn(async () => ({ count: 1 })),
      },
      assignment: {
        findFirst: jest.fn(async () => ({ id: base.assignmentId })),
        update: jest.fn(async ({ where, data }) => ({
          id: where.id,
          ...data,
        })),
      },
      user: {
        findFirst: jest.fn(async () => ({ id: base.fromUserId })),
      },
    };

    jest.doMock("@pathway/db", () => ({ prisma: prismaMock, SwapStatus }));

    prisma = prismaMock;
    SwapsServiceClass = (await import("../../swaps/swaps.service"))
      .SwapsService;
    service = new SwapsServiceClass();
  });

  it("creates a swap", async () => {
    const created = await service.create(
      {
        assignmentId: base.assignmentId,
        fromUserId: base.fromUserId,
        toUserId: base.toUserId!,
      },
      tenantId,
    );
    expect(prisma.swapRequest.create).toHaveBeenCalled();
    expect(created.assignmentId).toBe(base.assignmentId);
  });

  it("validates ACCEPTED requires toUserId", async () => {
    await expect(
      service.create(
        {
          assignmentId: base.assignmentId,
          fromUserId: base.fromUserId,
          status: SwapStatus.ACCEPTED,
        },
        tenantId,
      ),
    ).rejects.toBeInstanceOf(Error);
  });

  it("findAll filters by tenant", async () => {
    await service.findAll({
      tenantId,
      fromUserId: base.fromUserId,
      status: SwapStatus.REQUESTED,
    });
    expect(prisma.swapRequest.findMany).toHaveBeenCalled();
  });

  it("findOne returns swap", async () => {
    const found = await service.findOne(base.id, tenantId);
    expect(found).toHaveProperty("id", base.id);
  });

  it("update passes through", async () => {
    const res = await service.update(
      base.id,
      { status: SwapStatus.ACCEPTED, toUserId: base.fromUserId },
      tenantId,
    );
    expect(prisma.swapRequest.update).toHaveBeenCalled();
    expect(res.status).toBe(SwapStatus.ACCEPTED);
  });

  it("remove deletes with tenant scoping", async () => {
    await service.remove(base.id, tenantId);
    expect(prisma.swapRequest.deleteMany).toHaveBeenCalled();
  });
});
