import { Module, ModuleGrantSource, ModuleStatus } from "@pathway/db";
import { setMasterFinanceModule } from "../master-finance-module";

const tx = {
  moduleGrant: { upsert: jest.fn(), findMany: jest.fn() },
  orgModule: { findUnique: jest.fn(), upsert: jest.fn(), update: jest.fn() },
};
jest.mock("@pathway/db", () => ({
  Module: { FINANCE: "FINANCE" },
  ModuleGrantSource: { MANUAL: "MANUAL" },
  ModuleStatus: { ACTIVE: "ACTIVE", CANCELLED: "CANCELLED" },
  runTransaction: jest.fn(
    async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  ),
}));

const key = {
  orgId: "master-org",
  module: Module.FINANCE,
  source: ModuleGrantSource.MANUAL,
  sourceId: "master-finance",
};
beforeEach(() => {
  jest.clearAllMocks();
  tx.orgModule.findUnique.mockResolvedValue({
    status: ModuleStatus.ACTIVE,
    expiresAt: new Date("2020-01-01"),
  });
});

it("reactivates expired Finance with one durable, non-expiring grant on repeated requests", async () => {
  tx.moduleGrant.findMany.mockResolvedValue([{ ...key, expiresAt: null }]);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await expect(setMasterFinanceModule("master-org", true)).resolves.toEqual({
      module: Module.FINANCE,
      active: true,
    });
  }
  expect(tx.moduleGrant.upsert).toHaveBeenCalledTimes(2);
  expect(tx.moduleGrant.upsert).toHaveBeenCalledWith({
    where: { orgId_module_source_sourceId: key },
    create: { ...key, status: ModuleStatus.ACTIVE, expiresAt: null },
    update: { status: ModuleStatus.ACTIVE, expiresAt: null },
  });
  expect(tx.orgModule.upsert).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { orgId_module: { orgId: "master-org", module: Module.FINANCE } },
      update: {
        status: ModuleStatus.ACTIVE,
        expiresAt: null,
        metadata: {
          billingSource: "manual",
          grantSources: [
            { source: ModuleGrantSource.MANUAL, sourceId: "master-finance" },
          ],
        },
      },
    }),
  );
});

it("cancels only the Master grant and retains Finance records for servicing", async () => {
  tx.moduleGrant.findMany.mockResolvedValue([]);
  await expect(setMasterFinanceModule("master-org", false)).resolves.toEqual({
    module: Module.FINANCE,
    active: false,
  });
  expect(tx.moduleGrant.upsert).toHaveBeenCalledWith({
    where: { orgId_module_source_sourceId: key },
    create: { ...key, status: ModuleStatus.CANCELLED, expiresAt: null },
    update: { status: ModuleStatus.CANCELLED, expiresAt: null },
  });
  expect(tx.orgModule.update).toHaveBeenCalledWith({
    where: { orgId_module: { orgId: "master-org", module: Module.FINANCE } },
    data: { status: ModuleStatus.CANCELLED, expiresAt: expect.any(Date) },
  });
});
