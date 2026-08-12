import "reflect-metadata";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Prisma, withTenantRlsContext } from "@pathway/db";
import { REQUIRED_PERMISSION } from "../../access-control/require-permission.decorator";
import { AceDashboardController } from "../ace-dashboard.controller";
import { AceDashboardService } from "../ace-dashboard.service";

jest.mock("@pathway/db", () => ({
  withTenantRlsContext: jest.fn(),
  Prisma: {
    sql: jest.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
      strings: [...strings],
      values,
    })),
  },
}));

const NOW = new Date("2026-08-12T08:30:00.000Z");
const actor = {
  tenantId: "tenant-1",
  orgId: "org-1",
  userId: "user-1",
};

function transaction() {
  return {
    tenant: { findFirst: jest.fn() },
    attendance: { groupBy: jest.fn() },
    child: { count: jest.fn() },
    $queryRaw: jest.fn(),
  };
}

function createService(tx = transaction()) {
  jest
    .mocked(withTenantRlsContext)
    .mockImplementation(async (_tenantId, _orgId, callback) =>
      callback(tx as never),
    );
  return { service: new AceDashboardService(), tx };
}

function mockEmptyAggregates(tx: ReturnType<typeof transaction>) {
  tx.tenant.findFirst.mockResolvedValue({ timezone: "Europe/London" });
  tx.attendance.groupBy.mockResolvedValue([]);
  tx.child.count.mockResolvedValue(0);
  tx.$queryRaw
    .mockResolvedValueOnce([
      {
        ahead: 0n,
        onTrack: 0n,
        atRisk: 0n,
        behind: 0n,
        blocked: 0n,
        stale: 0n,
      },
    ])
    .mockResolvedValueOnce([{ siteReview: 0n, headReview: 0n }]);
}

describe("AceDashboardService", () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("requires the dedicated least-privilege permission on the dashboard route", () => {
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSION,
        AceDashboardController.prototype.get,
      ),
    ).toBe("ace.dashboard.read");
  });

  it("returns a zero-filled counts-only payload within the fixed query budget", async () => {
    const { service, tx } = createService();
    mockEmptyAggregates(tx);

    await expect(service.get({}, actor)).resolves.toEqual({
      localDate: "2026-08-12",
      timezone: "Europe/London",
      attendance: { present: 0, absent: 0, late: 0, unmarked: 0 },
      pace: {
        ahead: 0,
        onTrack: 0,
        atRisk: 0,
        behind: 0,
        blocked: 0,
        stale: 0,
      },
      behaviour: { siteReview: 0, headReview: 0 },
    });

    expect(withTenantRlsContext).toHaveBeenCalledWith(
      actor.tenantId,
      actor.orgId,
      expect.any(Function),
    );
    const queryCount =
      tx.tenant.findFirst.mock.calls.length +
      tx.attendance.groupBy.mock.calls.length +
      tx.child.count.mock.calls.length +
      tx.$queryRaw.mock.calls.length;
    expect(queryCount).toBeLessThanOrEqual(6);

    const selectedFields = JSON.stringify({
      site: tx.tenant.findFirst.mock.calls,
      attendance: tx.attendance.groupBy.mock.calls,
      children: tx.child.count.mock.calls,
      aggregateSql: jest
        .mocked(Prisma.sql)
        .mock.calls.map(([strings]) => strings.join("?")),
    });
    expect(selectedFields).not.toMatch(
      /reason|note|firstName|lastName|preferredName|guardian|family/i,
    );
  });

  it("maps partial buckets, current PACE facts, and terminal review intents", async () => {
    const { service, tx } = createService();
    tx.tenant.findFirst.mockResolvedValue({ timezone: "Europe/London" });
    tx.attendance.groupBy.mockResolvedValue([
      { status: "PRESENT", _count: { _all: 7 } },
      { status: "LATE", _count: { _all: 2 } },
    ]);
    tx.child.count.mockResolvedValue(12);
    tx.$queryRaw
      .mockResolvedValueOnce([
        {
          ahead: 1n,
          onTrack: 4n,
          atRisk: 2n,
          behind: 1n,
          blocked: 1n,
          stale: 3n,
        },
      ])
      .mockResolvedValueOnce([{ siteReview: 2n, headReview: 1n }]);

    await expect(service.get({ date: "2026-08-12" }, actor)).resolves.toEqual({
      localDate: "2026-08-12",
      timezone: "Europe/London",
      attendance: { present: 7, absent: 0, late: 2, unmarked: 3 },
      pace: {
        ahead: 1,
        onTrack: 4,
        atRisk: 2,
        behind: 1,
        blocked: 1,
        stale: 3,
      },
      behaviour: { siteReview: 2, headReview: 1 },
    });
  });

  it("uses the site's DST-aware UTC bounds for a requested local date", async () => {
    const { service, tx } = createService();
    mockEmptyAggregates(tx);

    await service.get({ date: "2026-03-29" }, actor);

    expect(tx.attendance.groupBy).toHaveBeenCalledWith({
      by: ["status"],
      where: {
        timestamp: {
          gte: new Date("2026-03-29T00:00:00.000Z"),
          lt: new Date("2026-03-29T23:00:00.000Z"),
        },
        child: { tenantId: actor.tenantId },
      },
      _count: { _all: true },
    });
  });

  it.each(["2026-02-30", "12-08-2026", "2026-8-12", "2026-08-12x"])(
    "rejects malformed dashboard date %s before opening an RLS transaction",
    async (date) => {
      const { service } = createService();

      await expect(service.get({ date }, actor)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(withTenantRlsContext).not.toHaveBeenCalled();
    },
  );

  it("rejects an unknown query field", async () => {
    const { service } = createService();

    await expect(
      service.get({ date: "2026-08-12", childId: "child-1" }, actor),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(withTenantRlsContext).not.toHaveBeenCalled();
  });

  it("rejects an invalid site timezone", async () => {
    const { service, tx } = createService();
    tx.tenant.findFirst.mockResolvedValue({ timezone: "Mars/Olympus" });

    await expect(service.get({}, actor)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(tx.attendance.groupBy).not.toHaveBeenCalled();
  });

  it("rejects a selected site outside the actor's organisation", async () => {
    const { service, tx } = createService();
    tx.tenant.findFirst.mockResolvedValue(null);

    await expect(service.get({}, actor)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
