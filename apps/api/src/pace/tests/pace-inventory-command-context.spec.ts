import { NotFoundException } from "@nestjs/common";
import { applyTenantContext, runTransaction } from "@pathway/db";
import { withInventoryTenantTransaction } from "../pace-inventory-command-context";

jest.mock("@pathway/db", () => ({
  applyTenantContext: jest.fn(),
  runTransaction: jest.fn(),
  Prisma: {
    PrismaClientKnownRequestError: class extends Error {},
    TransactionIsolationLevel: { Serializable: "Serializable" },
  },
}));

const actor = { tenantId: "site-a", orgId: "org-a", userId: "user-a" };

function setup() {
  const tx = {
    // A pooled connection may already have executed its initial query.
    $executeRawUnsafe: jest
      .fn()
      .mockRejectedValue(
        new Error(
          "SET TRANSACTION ISOLATION LEVEL must be called before any query",
        ),
      ),
    tenant: { findFirst: jest.fn().mockResolvedValue({ id: actor.tenantId }) },
  };
  jest
    .mocked(runTransaction)
    .mockImplementation(async (operation) => operation(tx as never));
  return tx;
}

describe("PACE inventory transaction setup", () => {
  beforeEach(() => jest.clearAllMocks());

  it("sets serializable isolation when opening the transaction, before pooled queries", async () => {
    const tx = setup();
    const operation = jest.fn().mockResolvedValue({ created: 2 });

    await expect(
      withInventoryTenantTransaction(actor, operation),
    ).resolves.toEqual({ created: 2 });

    expect(runTransaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
    });
    expect(tx.$executeRawUnsafe).not.toHaveBeenCalled();
    expect(applyTenantContext).toHaveBeenCalledWith(
      tx,
      actor.tenantId,
      actor.orgId,
    );
    expect(tx.tenant.findFirst).toHaveBeenCalledWith({
      where: { id: actor.tenantId, orgId: actor.orgId },
      select: { id: true },
    });
    expect(operation).toHaveBeenCalledWith(tx);
  });

  it("rejects a missing active site before any inventory mutation", async () => {
    const tx = setup();
    tx.tenant.findFirst.mockResolvedValue(null);
    const operation = jest.fn();

    await expect(
      withInventoryTenantTransaction(actor, operation),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(operation).not.toHaveBeenCalled();
  });
});
