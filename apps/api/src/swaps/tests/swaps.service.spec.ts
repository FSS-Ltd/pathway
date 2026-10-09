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
  updateMany: jest.Mock<Promise<{ count: number }>, [any?]>;
  deleteMany: jest.Mock<Promise<any>, [any?]>;
};

type PrismaAssignmentDelegate = {
  findFirst: jest.Mock<Promise<any>, [any?]>;
  findMany: jest.Mock<Promise<any[]>, [any?]>;
  updateMany: jest.Mock<Promise<{ count: number }>, [any?]>;
};

type PrismaUserDelegate = {
  findFirst: jest.Mock<Promise<any>, [any?]>;
  findMany: jest.Mock<Promise<any[]>, [any?]>;
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
    let currentSwap = { ...base };

    const prismaMock: PrismaMock = {
      swapRequest: {
        create: jest.fn(async ({ data }) => ({ ...base, ...data })),
        findFirst: jest.fn(async ({ where }) => ({
          ...currentSwap,
          id: where.id ?? base.id,
        })),
        findMany: jest.fn(async () => [base]),
        updateMany: jest.fn(async ({ data }) => {
          currentSwap = { ...currentSwap, ...data };
          return { count: 1 };
        }),
        deleteMany: jest.fn(async () => ({ count: 1 })),
      },
      assignment: {
        findFirst: jest.fn(async () => ({
          id: base.assignmentId,
          userId: base.fromUserId,
          sessionId: "session-1",
        })),
        findMany: jest.fn(async () => [{ userId: base.fromUserId }]),
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
      user: {
        findFirst: jest.fn(async () => ({ id: base.fromUserId })),
        findMany: jest.fn(async () => [
          { id: base.fromUserId, firstName: "A", lastName: "Staff" },
          { id: "candidate", firstName: "B", lastName: "Staff" },
        ]),
      },
    };

    jest.doMock("@pathway/db", () => ({
      prisma: prismaMock,
      SwapStatus,
      AssignmentStatus: { DECLINED: "DECLINED" },
      Role: {
        ADMIN: "ADMIN",
        COORDINATOR: "COORDINATOR",
        TEACHER: "TEACHER",
        LEAD: "LEAD",
        SUPPORT: "SUPPORT",
      },
      SiteRole: { STAFF: "STAFF", SITE_ADMIN: "SITE_ADMIN" },
      withTenantRlsContext: async (
        _tenantId: string,
        _orgId: string,
        run: () => Promise<unknown>,
      ) => run(),
    }));

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
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: base.fromUserId,
        isActive: true,
        OR: expect.arrayContaining([
          {
            siteMemberships: {
              some: {
                tenantId,
                role: { in: ["STAFF", "SITE_ADMIN"] },
              },
            },
          },
        ]),
      }),
      select: { id: true },
    });
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

  it("rejects a requester who does not hold the assignment", async () => {
    prisma.assignment.findFirst.mockResolvedValueOnce({
      id: base.assignmentId,
      userId: "another-staff-member",
    });
    await expect(
      service.create(
        { assignmentId: base.assignmentId, fromUserId: base.fromUserId },
        tenantId,
      ),
    ).rejects.toThrow("Requester must hold the assignment");
    expect(prisma.swapRequest.create).not.toHaveBeenCalled();
  });

  it("rejects a swap request for a declined assignment", async () => {
    prisma.assignment.findFirst.mockResolvedValueOnce({
      id: base.assignmentId,
      userId: base.fromUserId,
      status: "DECLINED",
    });
    await expect(
      service.create(
        {
          assignmentId: base.assignmentId,
          fromUserId: base.fromUserId,
          toUserId: "33333333-3333-4333-9333-333333333333",
        },
        tenantId,
      ),
    ).rejects.toThrow("A declined assignment cannot be swapped");
    expect(prisma.swapRequest.create).not.toHaveBeenCalled();
  });

  it("rejects a recipient without active staff access at the site", async () => {
    prisma.user.findFirst
      .mockResolvedValueOnce({ id: base.fromUserId })
      .mockResolvedValueOnce(null);
    await expect(
      service.create(
        {
          assignmentId: base.assignmentId,
          fromUserId: base.fromUserId,
          toUserId: "33333333-3333-4333-9333-333333333333",
        },
        tenantId,
      ),
    ).rejects.toThrow("toUser not found");
    expect(prisma.swapRequest.create).not.toHaveBeenCalled();
  });

  it("findAll filters by tenant", async () => {
    await service.findAll({
      tenantId,
      fromUserId: base.fromUserId,
      status: SwapStatus.REQUESTED,
      participantUserId: base.fromUserId,
    });
    expect(prisma.swapRequest.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        assignment: { session: { tenantId } },
        OR: [{ fromUserId: base.fromUserId }, { toUserId: base.fromUserId }],
      }),
      orderBy: { createdAt: "desc" },
      include: expect.objectContaining({
        assignment: expect.any(Object),
        fromUser: expect.any(Object),
        toUser: expect.any(Object),
      }),
    });
  });

  it("lists only active site staff outside the assignment's session", async () => {
    prisma.assignment.findMany.mockResolvedValueOnce([
      { userId: base.fromUserId },
      { userId: "already-assigned" },
    ]);
    prisma.user.findMany.mockResolvedValueOnce([
      { id: "already-assigned", firstName: "C", lastName: "Staff" },
      { id: "candidate", firstName: "B", lastName: "Staff" },
      { id: base.fromUserId, firstName: "A", lastName: "Staff" },
    ]);

    await expect(
      service.findCandidates(base.assignmentId, base.fromUserId, tenantId),
    ).resolves.toEqual([{ id: "candidate", fullName: "B Staff" }]);
    expect(prisma.assignment.findFirst).toHaveBeenCalledWith({
      where: {
        id: base.assignmentId,
        userId: base.fromUserId,
        session: { tenantId },
      },
      select: { sessionId: true, status: true },
    });
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        isActive: true,
        OR: expect.arrayContaining([
          {
            siteMemberships: {
              some: { tenantId, role: { in: ["STAFF", "SITE_ADMIN"] } },
            },
          },
        ]),
      }),
      select: expect.objectContaining({ id: true, name: true }),
    });
  });

  it("does not reveal staff when the requester does not hold the assignment", async () => {
    prisma.assignment.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.findCandidates(base.assignmentId, "unrelated", tenantId),
    ).rejects.toThrow("Assignment not found");
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it("does not offer a swap for a declined assignment", async () => {
    prisma.assignment.findFirst.mockResolvedValueOnce({
      id: base.assignmentId,
      userId: base.fromUserId,
      sessionId: "session-1",
      status: "DECLINED",
    });
    await expect(
      service.findCandidates(base.assignmentId, base.fromUserId, tenantId),
    ).rejects.toThrow("Assignment not found");
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it("findOne returns swap", async () => {
    const found = await service.findOne(base.id, tenantId);
    expect(found).toHaveProperty("id", base.id);
  });

  it("update passes through", async () => {
    const recipientId = "33333333-3333-4333-9333-333333333333";
    const res = await service.update(
      base.id,
      { status: SwapStatus.ACCEPTED, toUserId: recipientId },
      tenantId,
      "org-1",
    );
    expect(prisma.swapRequest.updateMany).toHaveBeenCalledWith({
      where: {
        id: base.id,
        status: SwapStatus.REQUESTED,
        assignment: { session: { tenantId } },
      },
      data: { toUserId: recipientId, status: SwapStatus.ACCEPTED },
    });
    expect(prisma.assignment.updateMany).toHaveBeenCalledWith({
      where: {
        id: base.assignmentId,
        userId: base.fromUserId,
        status: { not: "DECLINED" },
        session: { tenantId },
      },
      data: { userId: recipientId },
    });
    expect(res.status).toBe(SwapStatus.ACCEPTED);
  });

  it("rejects a competing decision before reassigning a shift", async () => {
    prisma.swapRequest.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      service.update(
        base.id,
        {
          status: SwapStatus.ACCEPTED,
          toUserId: "33333333-3333-4333-9333-333333333333",
        },
        tenantId,
        "org-1",
      ),
    ).rejects.toThrow("Swap request is no longer open");
    expect(prisma.assignment.updateMany).not.toHaveBeenCalled();
  });

  it("remove deletes with tenant scoping", async () => {
    await service.remove(base.id, tenantId);
    expect(prisma.swapRequest.deleteMany).toHaveBeenCalled();
  });
});
