import { BillingProvider, Module, withTenantRlsContext } from "@pathway/db";
import { requireDatabase } from "../../../test-helpers.e2e";

describe("PendingOrder selectedModules (e2e)", () => {
  const orgId = process.env.E2E_ORG_ID as string;
  const tenantId = process.env.E2E_TENANT_ID as string;
  const createdOrderIds: string[] = [];

  afterEach(async () => {
    if (!requireDatabase() || createdOrderIds.length === 0) {
      return;
    }

    await withTenantRlsContext(tenantId, orgId, (tx) =>
      tx.pendingOrder.deleteMany({ where: { id: { in: createdOrderIds } } }),
    );
    createdOrderIds.length = 0;
  });

  it("persists selected modules and defaults omitted selections to an empty array", async () => {
    if (!requireDatabase()) {
      return;
    }

    const { withModules, withoutModules } = await withTenantRlsContext(tenantId, orgId, async (tx) => {
      const [createdWithModules, createdWithoutModules] = await Promise.all([
        tx.pendingOrder.create({
          data: {
            tenantId,
            orgId,
            planCode: "STARTER_49_MONTHLY",
            provider: BillingProvider.STRIPE,
            selectedModules: [Module.FINANCE, Module.EVENTS],
          },
        }),
        tx.pendingOrder.create({
          data: {
            tenantId,
            orgId,
            planCode: "STARTER_49_MONTHLY",
            provider: BillingProvider.STRIPE,
          },
        }),
      ]);

      const [withModules, withoutModules] = await Promise.all([
        tx.pendingOrder.findUniqueOrThrow({ where: { id: createdWithModules.id } }),
        tx.pendingOrder.findUniqueOrThrow({ where: { id: createdWithoutModules.id } }),
      ]);

      return { withModules, withoutModules };
    });

    createdOrderIds.push(withModules.id, withoutModules.id);

    expect(withModules.selectedModules).toEqual([Module.FINANCE, Module.EVENTS]);
    expect(withoutModules.selectedModules).toEqual([]);
  });
});
