import "reflect-metadata";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Prisma, withTenantRlsContext } from "@pathway/db";
import { REQUIRED_PERMISSION } from "../../access-control/require-permission.decorator";
import { PaceInventoryController } from "../pace-inventory.controller";
import {
  createPaceInventoryCursorScope,
  encodePaceInventoryCursor,
} from "../pace-inventory-cursor";
import { PaceInventoryQueryService } from "../pace-inventory-query.service";

jest.mock("@pathway/db", () => ({
  withTenantRlsContext: jest.fn(),
  Prisma: {
    empty: {},
    sql: jest.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
      strings: [...strings],
      values,
    })),
  },
}));

const actor = { tenantId: "tenant-1", orgId: "org-1", userId: "user-1" };

function transaction() {
  return {
    tenant: { findFirst: jest.fn().mockResolvedValue({ id: actor.tenantId }) },
    paceInventoryOrder: { findMany: jest.fn().mockResolvedValue([]) },
    $queryRaw: jest.fn().mockResolvedValue([]),
  };
}

function setup() {
  const tx = transaction();
  jest
    .mocked(withTenantRlsContext)
    .mockImplementation(async (_tenant, _org, callback) =>
      callback(tx as never),
    );
  return { service: new PaceInventoryQueryService(), tx };
}

describe("PACE inventory reads", () => {
  beforeEach(() => jest.clearAllMocks());

  it("guards both routes with the ACE inventory read permission", () => {
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSION,
        PaceInventoryController.prototype.orders,
      ),
    ).toBe("ace.pace.inventory.read");
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSION,
        PaceInventoryController.prototype.stock,
      ),
    ).toBe("ace.pace.inventory.read");
  });

  it("restricts order history to the active site and bounds the page", async () => {
    const { service, tx } = setup();
    const createdAt = new Date("2026-10-06T08:00:00.000Z");
    tx.paceInventoryOrder.findMany.mockResolvedValue([
      {
        id: "order-1",
        childId: "child-1",
        child: { firstName: "Ada", lastName: "Lovelace", preferredName: null },
        subjectId: "subject-1",
        subject: { name: "Mathematics" },
        paceNumber: 1002,
        status: "ORDERED",
        orderedAt: createdAt,
        inTransitAt: null,
        deliveredAt: null,
        createdAt,
      },
      { id: "order-next", createdAt },
    ]);

    const result = await service.listOrders(actor, {
      limit: 1,
      status: "ORDERED",
    });

    expect(result.items).toEqual([
      {
        id: "order-1",
        child: { id: "child-1", displayName: "Ada Lovelace" },
        subject: { id: "subject-1", name: "Mathematics" },
        paceNumber: 1002,
        status: "ORDERED",
        orderedAt: createdAt.toISOString(),
        inTransitAt: null,
        deliveredAt: null,
      },
    ]);
    expect(result.nextCursor).toEqual(expect.any(String));
    expect(tx.paceInventoryOrder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: "tenant-1", status: "ORDERED" },
        take: 2,
      }),
    );
    expect(withTenantRlsContext).toHaveBeenCalledWith(
      "tenant-1",
      "org-1",
      expect.any(Function),
    );
  });

  it("distinguishes no stock, low stock and pending-order suppression", async () => {
    const { service, tx } = setup();
    const base = {
      enrollmentCreatedAt: new Date("2026-10-06T08:00:00.000Z"),
      childId: "child-1",
      firstName: "Ada",
      lastName: "Lovelace",
      preferredName: null,
      subjectId: "subject-1",
      subjectName: "Mathematics",
      currentPace: 1001,
    };
    tx.$queryRaw.mockResolvedValue([
      {
        ...base,
        enrollmentId: "enrollment-1",
        futurePaceNumbers: [],
        hasPendingOrder: true,
      },
      {
        ...base,
        enrollmentId: "enrollment-2",
        futurePaceNumbers: [1002, 1003],
        hasPendingOrder: false,
      },
      {
        ...base,
        enrollmentId: "enrollment-3",
        futurePaceNumbers: [1002],
        hasPendingOrder: true,
      },
    ]);

    const result = await service.listStock(actor, { attentionOnly: "true" });

    expect(
      result.items.map((item) => [item.stockState, item.needsAttention]),
    ).toEqual([
      ["NO_STOCK", true],
      ["LOW_STOCK", true],
      ["LOW_STOCK", false],
    ]);
    const sql = jest
      .mocked(Prisma.sql)
      .mock.calls.map(([strings]) => strings.join("?"));
    expect(sql.join(" ")).toContain(
      "pending_order.status IN ('ORDERED', 'IN_TRANSIT')",
    );
    expect(sql.join(" ")).toContain(
      'supply."paceNumber" > current_pace."paceNumber"',
    );
  });

  it("rejects a cursor from a different site or view", async () => {
    const { service } = setup();
    const cursor = encodePaceInventoryCursor({
      createdAt: new Date("2026-10-06T08:00:00.000Z"),
      id: "order-1",
      scope: createPaceInventoryCursorScope({
        tenantId: actor.tenantId,
        orgId: actor.orgId,
        view: "orders",
      }),
    });
    await expect(service.listStock(actor, { cursor })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      service.listOrders({ ...actor, tenantId: "other-site" }, { cursor }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects an inactive or mismatched site before reading inventory", async () => {
    const { service, tx } = setup();
    tx.tenant.findFirst.mockResolvedValue(null);

    await expect(service.listOrders(actor, {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(tx.paceInventoryOrder.findMany).not.toHaveBeenCalled();
  });
});
